param(
  [string]$BackendRoot = "",
  [string]$Template = "db_options/DbOption.toml",
  [string]$RuntimeDir = "runtime/local-collab",
  [int]$SiteAPort = 4100,
  [int]$SiteBPort = 4101,
  [int]$SiteASurrealPort = 8021,
  [int]$SiteBSurrealPort = 8022,
  [string]$MqttHost = "127.0.0.1",
  [int]$MqttPort = 1883,
  [string]$ExePath = "",
  [ValidateSet("pws", "pmg")]
  [string]$Backend = "pws",
  [string]$MosquittoDir = "",
  [string]$AdminUser = "admin",
  [string]$AdminPass = "admin",
  [string[]]$IncludedProjects = @("SCB"),
  [string]$SiteALocationDbs = "[6000]",
  [string]$RelayDbFile = "scb6000_0001",
  [switch]$ShareProjectPath,
  [switch]$VersionedStorage,
  [switch]$Force,
  [switch]$PrintOnly,
  [switch]$Help
)

# 本机双站点异地协同环境生成器（SQLite-only 中继模式 · 方案 P4）
#
# 以 ../plant-model-gen/db_options/DbOption.toml 为模板，生成两份彼此隔离的**中继站点**配置：
#   <BackendRoot>/runtime/local-collab/site-a/DbOption.toml   (:4100 · location local-a · 自有库 [6000])
#   <BackendRoot>/runtime/local-collab/site-b/DbOption.toml   (:4101 · location local-b · 自有库 [])
# 两站都是 sync_relay_mode = true：只分发源 db 文件（e3d-io 判变更 → MQTT 广播 → 对端 clone + 校验），
# 不解析入库、不生成几何，**不需要任何 SurrealDB 进程**（auto_start_surreal = false，[surrealdb] 段保留但不再要求可连）。
# 并写出每个站点的 start.ps1、Mosquitto 配置 + start-mosquitto.ps1、文件服务 fixture
# （output/index.html + output/metadata.json、assets/archives/index.html，供 test-http 探测），
# 最后打印按顺序要在各自终端里执行的命令（长驻进程不由本脚本拉起）。
#
# 工程文件：默认把模板 project_path 下的 -IncludedProjects（默认 ["SCB"]，约 3 MB）**各复制一份**到
# <site>/project/，两站各读各的副本——B 收到 A 的广播后 clone 写的是自己那份，不碰真实工程；
# smoke（LS-23/24）会把 B 的副本追加垃圾字节再看它被 A 的 CBA 还原。首轮 db_index 扫描随工程大小
# 线性增长（整套 E3D2.1 样例要十几分钟），所以默认只收 SCB。-ShareProjectPath 则两站都直接读真实工程。
#
# 隔离项（对齐 docs/e2e-smoke/local-remote-collab-test-plan.md §3）：
#   location / location_dbs / file_server_host / deployment_sites_sqlite_path / output_root / project_path /
#   [web_server].port|bind_host|site_id|site_name|region / [surrealdb].port（保留隔离，实际不用）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force        # 覆盖已生成的文件（含工程副本）
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -PrintOnly    # 只打印命令
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -MosquittoDir "C:\Program Files\mosquitto"
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -IncludedProjects SCB,ZDJ -SiteALocationDbs "[6000, 7009]"

$ErrorActionPreference = "Stop"

if ($Help) {
  Get-Content $PSCommandPath | Select-Object -Skip 24 -First 26 | ForEach-Object { $_ -replace '^# ?', '' }
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
  $BackendRoot = Join-Path (Split-Path -Parent $repoRoot) "plant-model-gen"
}
$BackendRoot = [System.IO.Path]::GetFullPath($BackendRoot)
if (-not (Test-Path (Join-Path $BackendRoot $Template))) {
  Write-Error "找不到模板 $(Join-Path $BackendRoot $Template)；用 -BackendRoot / -Template 指定。"
  exit 2
}
$runtimeAbs = Join-Path $BackendRoot $RuntimeDir
$runtimeRel = $RuntimeDir.TrimEnd('/', '\').Replace('\', '/')

if ($Backend -ne "pws" -and $Backend -ne "pmg") {
  Write-Error "-Backend 只能是 pws（plant-web-server，默认）或 pmg（plant-model-gen 的 web_server）。"
  exit 2
}
$backendIsPws = ($Backend -eq "pws")
if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { "D:\Rust\target" }
  $ExePath = Join-Path $targetDir $(if ($backendIsPws) { "debug\plant-web-server.exe" } else { "debug\web_server.exe" })
}
$backendLabel = if ($backendIsPws) { "plant-web-server" } else { "plant-model-gen/web_server" }
$backendBuildFix = if ($backendIsPws) {
  "cd $(Split-Path -Parent $BackendRoot)\plant-web-server; cargo build --bin plant-web-server"
} else {
  "cd $BackendRoot; cargo build --bin web_server --features web_server,relay-sync"
}

# ---------------------------------------------------------------------------
# 工具探测
# ---------------------------------------------------------------------------
function Find-Executable([string]$Name, [string[]]$ExtraDirs) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $cmd) { return $cmd.Source }
  foreach ($dir in $ExtraDirs) {
    if ([string]::IsNullOrWhiteSpace($dir)) { continue }
    $candidate = Join-Path $dir "$Name.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

$mosquittoDirs = @($MosquittoDir, "C:\Program Files\mosquitto", "C:\Program Files (x86)\mosquitto")
$mosquittoExe = Find-Executable "mosquitto" $mosquittoDirs
$mosquittoPubExe = Find-Executable "mosquitto_pub" $mosquittoDirs
$pythonExe = Find-Executable "python" @()
$sqliteExe = Find-Executable "sqlite3" @()

# 中继模式不需要 surreal：构建 feature 是 web_server,relay-sync（带 e3d-io），不是 web_server,mqtt
$prereqs = @(
  [pscustomobject]@{ item = "站点后端 $backendLabel"; ok = (Test-Path $ExePath); detail = $ExePath; fix = $backendBuildFix },
  [pscustomobject]@{ item = "mosquitto（broker）"; ok = ($null -ne $mosquittoExe); detail = $mosquittoExe; fix = "winget install --id EclipseFoundation.Mosquitto -e   # 装到 C:\Program Files\mosquitto，不进 PATH" },
  [pscustomobject]@{ item = "mosquitto_pub（smoke LS-19 用）"; ok = ($null -ne $mosquittoPubExe); detail = $mosquittoPubExe; fix = "同上；smoke 用 -MosquittoDir 'C:\Program Files\mosquitto' 指定" },
  [pscustomobject]@{ item = "sqlite3 或 python（smoke LS-23/24 查两站台账）"; ok = ($null -ne $sqliteExe -or $null -ne $pythonExe); detail = $(if ($sqliteExe) { $sqliteExe } else { $pythonExe }); fix = "winget install --id SQLite.SQLite -e   # 或装 python；smoke 用 -SqliteExe 指定" },
  [pscustomobject]@{ item = "python + tomllib（可选，校验生成的 TOML）"; ok = ($null -ne $pythonExe); detail = $pythonExe; fix = "可选" }
)

# ---------------------------------------------------------------------------
# TOML 编辑（按 section 定位；缺 key 则追加到该 section 末尾）
# ---------------------------------------------------------------------------
function Get-TomlSectionName([string]$Line) {
  if ($Line -match '^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$') { return $Matches[1].Trim() }
  return $null
}

function Get-TomlSectionRange([System.Collections.Generic.List[string]]$Lines, [string]$Section) {
  # 返回 @{ start; end } 半开区间；找不到 section 返回 $null
  if ($Section -eq "") {
    $end = $Lines.Count
    for ($i = 0; $i -lt $Lines.Count; $i++) {
      if ($null -ne (Get-TomlSectionName $Lines[$i])) { $end = $i; break }
    }
    return @{ start = 0; end = $end }
  }
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $name = Get-TomlSectionName $Lines[$i]
    if ($name -eq $Section) {
      $end = $Lines.Count
      for ($j = $i + 1; $j -lt $Lines.Count; $j++) {
        if ($null -ne (Get-TomlSectionName $Lines[$j])) { $end = $j; break }
      }
      return @{ start = $i + 1; end = $end }
    }
  }
  return $null
}

function Set-TomlValue([System.Collections.Generic.List[string]]$Lines, [string]$Section, [string]$Key, [string]$Literal) {
  $range = Get-TomlSectionRange $Lines $Section
  if ($null -eq $range) {
    if ($Lines.Count -gt 0 -and $Lines[$Lines.Count - 1].Trim() -ne "") { $Lines.Add("") }
    $Lines.Add("[$Section]")
    $range = @{ start = $Lines.Count; end = $Lines.Count }
  }
  $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
  for ($i = $range.start; $i -lt $range.end; $i++) {
    if ($Lines[$i] -match $pattern) {
      $Lines[$i] = "$Key = $Literal"
      return "replaced"
    }
  }
  # 追加：放在该 section 最后一个真实键之后（跳过尾部空行与注释，别插进下一个 section 的标题注释里）
  $insertAt = $range.end
  while ($insertAt -gt $range.start -and ($Lines[$insertAt - 1].Trim() -eq "" -or $Lines[$insertAt - 1].TrimStart().StartsWith("#"))) { $insertAt-- }
  $Lines.Insert($insertAt, "$Key = $Literal")
  return "added"
}

function ConvertTo-TomlString([string]$Value) {
  return '"' + $Value.Replace('\', '/').Replace('"', '\"') + '"'
}

# ---------------------------------------------------------------------------
# 站点定义
# ---------------------------------------------------------------------------
$sites = @(
  [pscustomobject]@{ key = "site-a"; label = "Local Site A"; location = "local-a"; port = $SiteAPort; surrealPort = $SiteASurrealPort; locationDbs = $SiteALocationDbs },
  [pscustomobject]@{ key = "site-b"; label = "Local Site B"; location = "local-b"; port = $SiteBPort; surrealPort = $SiteBSurrealPort; locationDbs = "[]" }
)

$templateLines = Get-Content (Join-Path $BackendRoot $Template) -Encoding UTF8
$generated = [System.Collections.Generic.List[object]]::new()

# 模板里的真实工程根（project_path），工程副本从这里复制
function Get-TemplateRootString([string]$Key) {
  foreach ($l in $templateLines) {
    if ($null -ne (Get-TomlSectionName $l)) { break }
    if ($l -match ('^\s*' + [regex]::Escape($Key) + '\s*=\s*"([^"]*)"')) { return $Matches[1] }
  }
  return $null
}
$templateProjectPath = Get-TemplateRootString "project_path"
$IncludedProjects = @($IncludedProjects | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

function ConvertTo-TomlStringArray([string[]]$Values) {
  return "[" + (($Values | ForEach-Object { ConvertTo-TomlString $_ }) -join ", ") + "]"
}

function Get-SiteProjectPathRel($Site) {
  if ($ShareProjectPath) { return $null }
  return "$runtimeRel/$($Site.key)/project"
}

function New-SiteConfigText($Site) {
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# 由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 生成")
  $lines.Add("# 模板：$Template · 站点：$($Site.key)（$($Site.location) · :$($Site.port) · 中继模式 sync_relay_mode = true，无 SurrealDB）")
  $lines.Add("# 仅供本机双站点 smoke 使用；activate 会改写本文件的 mqtt_host / mqtt_port / file_server_host / location / location_dbs")
  foreach ($l in $templateLines) { $lines.Add($l) }

  $siteDir = "$runtimeRel/$($Site.key)"
  $base = "http://127.0.0.1:$($Site.port)"
  $surrealData = "$siteDir/surreal.db"

  # 根节点
  # 中继模式：只分发源 db 文件，activate 跳过 SurrealDB 硬闸，启动期跳过 SurrealDB 自启动（方案 P2）
  Set-TomlValue $lines "" "sync_relay_mode" "true" | Out-Null
  Set-TomlValue $lines "" "location" (ConvertTo-TomlString $Site.location) | Out-Null
  Set-TomlValue $lines "" "location_dbs" $Site.locationDbs | Out-Null
  Set-TomlValue $lines "" "mqtt_host" (ConvertTo-TomlString $MqttHost) | Out-Null
  Set-TomlValue $lines "" "mqtt_port" "$MqttPort" | Out-Null
  # file_server_host 是「别的站点来我这下载 CBA」的地址：web_server 把 assets/archives 挂在 /assets/archives
  Set-TomlValue $lines "" "file_server_host" (ConvertTo-TomlString "$base/assets/archives") | Out-Null
  Set-TomlValue $lines "" "remote_file_server_hosts" "[]" | Out-Null
  Set-TomlValue $lines "" "deployment_sites_sqlite_path" (ConvertTo-TomlString "$siteDir/deployment_sites.sqlite") | Out-Null
  Set-TomlValue $lines "" "output_root" (ConvertTo-TomlString "$siteDir/output") | Out-Null
  # 工程：每站一份副本（默认）或共用真实工程（-ShareProjectPath）；只收 -IncludedProjects 里的工程
  $projectPathRel = Get-SiteProjectPathRel $Site
  if ($null -ne $projectPathRel) { Set-TomlValue $lines "" "project_path" (ConvertTo-TomlString $projectPathRel) | Out-Null }
  if ($IncludedProjects.Count -gt 0) { Set-TomlValue $lines "" "included_projects" (ConvertTo-TomlStringArray $IncludedProjects) | Out-Null }
  # smoke 不需要模型 / 空间树，关掉以免启动期触发 Scene Tree 构建
  Set-TomlValue $lines "" "gen_model" "false" | Out-Null
  Set-TomlValue $lines "" "gen_mesh" "false" | Out-Null
  Set-TomlValue $lines "" "gen_spatial_tree" "false" | Out-Null
  Set-TomlValue $lines "" "versioned_storage" ($(if ($VersionedStorage) { "true" } else { "false" })) | Out-Null
  # rs-core 旧路径仍读这几个根键连 ws SurrealDB（中继模式不会真连，保留隔离以防有人把开关关掉）
  Set-TomlValue $lines "" "ip" '"127.0.0.1"' | Out-Null
  Set-TomlValue $lines "" "surreal_ip" '"127.0.0.1"' | Out-Null
  Set-TomlValue $lines "" "surreal_port" "$($Site.surrealPort)" | Out-Null

  # [web_server]
  Set-TomlValue $lines "web_server" "port" "$($Site.port)" | Out-Null
  Set-TomlValue $lines "web_server" "bind_host" '"127.0.0.1"' | Out-Null
  Set-TomlValue $lines "web_server" "site_id" (ConvertTo-TomlString $Site.location) | Out-Null
  Set-TomlValue $lines "web_server" "site_name" (ConvertTo-TomlString $Site.label) | Out-Null
  Set-TomlValue $lines "web_server" "region" (ConvertTo-TomlString $Site.location) | Out-Null
  Set-TomlValue $lines "web_server" "backend_url" (ConvertTo-TomlString $base) | Out-Null
  Set-TomlValue $lines "web_server" "public_base_url" (ConvertTo-TomlString $base) | Out-Null
  # 中继模式不需要 SurrealDB；bin/web_server.rs 在 sync_relay_mode = true 时也会跳过自启动，这里一并置 false
  Set-TomlValue $lines "web_server" "auto_start_surreal" "false" | Out-Null
  Set-TomlValue $lines "web_server" "surreal_data_path" (ConvertTo-TomlString $surrealData) | Out-Null
  Set-TomlValue $lines "web_server" "surreal_bind" (ConvertTo-TomlString "127.0.0.1:$($Site.surrealPort)") | Out-Null

  # [surrealdb]（保留隔离，中继模式不连）
  Set-TomlValue $lines "surrealdb" "mode" '"ws"' | Out-Null
  Set-TomlValue $lines "surrealdb" "ip" '"127.0.0.1"' | Out-Null
  Set-TomlValue $lines "surrealdb" "port" "$($Site.surrealPort)" | Out-Null
  Set-TomlValue $lines "surrealdb" "path" (ConvertTo-TomlString $surrealData) | Out-Null

  return ($lines -join "`n") + "`n"
}

# 把模板工程根下的 -IncludedProjects 复制到 <site>/project/<proj>（跳过 PdmsWatcher 生成的 cbas 目录）
function Copy-SiteProjects($Site) {
  if ($ShareProjectPath -or $IncludedProjects.Count -eq 0) { return }
  if ([string]::IsNullOrWhiteSpace($templateProjectPath)) {
    Write-Warning "模板里读不到 project_path，无法复制工程副本；请用 -ShareProjectPath"
    return
  }
  $siteAbs = Join-Path $runtimeAbs $Site.key
  foreach ($proj in $IncludedProjects) {
    $src = Join-Path $templateProjectPath $proj
    $dst = Join-Path (Join-Path $siteAbs "project") $proj
    if (-not (Test-Path $src)) {
      $generated.Add([pscustomobject]@{ kind = "project"; path = $dst; action = "SKIPPED（源不存在：$src）" }) | Out-Null
      continue
    }
    $exists = Test-Path $dst
    if ($PrintOnly) { $generated.Add([pscustomobject]@{ kind = "project"; path = $dst; action = "(print-only)" }) | Out-Null; continue }
    if ($exists -and -not $Force) { $generated.Add([pscustomobject]@{ kind = "project"; path = $dst; action = "kept (加 -Force 重新复制)" }) | Out-Null; continue }
    if ($exists) { Remove-Item $dst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $copied = 0
    foreach ($item in Get-ChildItem $src -Recurse -Force) {
      $rel = $item.FullName.Substring($src.TrimEnd('\').Length).TrimStart('\')
      if ($rel -split '\\' | Where-Object { $_ -eq 'cbas' }) { continue }
      $target = Join-Path $dst $rel
      if ($item.PSIsContainer) { New-Item -ItemType Directory -Force -Path $target | Out-Null }
      else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null; Copy-Item $item.FullName $target -Force; $copied++ }
    }
    $mb = [math]::Round((Get-ChildItem $dst -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 2)
    $generated.Add([pscustomobject]@{ kind = "project"; path = $dst; action = "$(if ($exists) { 'recopied' } else { 'copied' }) ($copied files, $mb MB)" }) | Out-Null
  }
}

# 一站里 smoke 用来演练中继的那个 db 文件（LS-23 回退 A 的水位、LS-24 看 B 的副本被还原）
function Get-RelayDbFilePath($Site) {
  $root = if ($ShareProjectPath) { $templateProjectPath } else { Join-Path (Join-Path $runtimeAbs $Site.key) "project" }
  if ([string]::IsNullOrWhiteSpace($root)) { return $null }
  $hit = Get-ChildItem $root -Recurse -File -Filter $RelayDbFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { return $hit.FullName }
  # 还没复制（PrintOnly）时按约定猜：<root>/<proj>/<proj小写>000/<file>
  foreach ($proj in $IncludedProjects) {
    $guess = Join-Path $root "$proj\$($proj.ToLower())000\$RelayDbFile"
    if (Test-Path $guess) { return $guess }
  }
  return (Join-Path $root "<project>\<project>000\$RelayDbFile")
}

function Write-GeneratedFile([string]$Path, [string]$Content, [string]$Kind) {
  $exists = Test-Path $Path
  if ($PrintOnly) {
    $generated.Add([pscustomobject]@{ kind = $Kind; path = $Path; action = "(print-only)" }) | Out-Null
    return
  }
  if ($exists -and -not $Force) {
    $generated.Add([pscustomobject]@{ kind = $Kind; path = $Path; action = "kept (加 -Force 覆盖)" }) | Out-Null
    return
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
  $generated.Add([pscustomobject]@{ kind = $Kind; path = $Path; action = $(if ($exists) { "overwritten" } else { "created" }) }) | Out-Null
}

$backendRootPs = $BackendRoot.Replace("'", "''")
$exePs = $ExePath.Replace("'", "''")

foreach ($site in $sites) {
  $siteAbs = Join-Path $runtimeAbs $site.key
  $configRel = "$runtimeRel/$($site.key)/DbOption"   # --config 不带 .toml

  Copy-SiteProjects $site
  Write-GeneratedFile (Join-Path $siteAbs "DbOption.toml") (New-SiteConfigText $site) "config"

  $start = if ($backendIsPws) {
    @"
# $($site.label) · plant-web-server 启动器（由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 生成）
# 中继模式（sync_relay_mode = true）：不需要 SurrealDB。长驻进程：在你自己的终端里运行，Ctrl+C 结束。
# --repo-root 让进程 chdir 到 plant-model-gen：配置里全是相对路径，两站也共用它下面的
# assets/archives 作 CBA 目录（对端按 file_server_host 到 /assets/archives 下载）。
# PLANT_WEB_RUNTIME_DIR 必须每站一个：不给的话两站共用 plant-web-server 源码树下那一份
# envs.json，谁后写谁赢，而且两边都不报错。
`$ErrorActionPreference = 'Stop'
Set-Location '$backendRootPs'
`$env:ADMIN_USER = '$AdminUser'
`$env:ADMIN_PASS = '$AdminPass'
`$env:WEB_SERVER_PORT = '$($site.port)'
`$env:PLANT_WEB_RUNTIME_DIR = '$(Join-Path $siteAbs "pws-runtime")'
`$exe = '$exePs'
Write-Host "[$($site.key)] :$($site.port) · location $($site.location) · config $configRel.toml · relay（plant-web-server，无 SurrealDB）"
if (Test-Path `$exe) {
  & `$exe --repo-root '$backendRootPs' --config '$configRel'
} else {
  Write-Host "[$($site.key)] 未找到 `$exe，改用 cargo run（首次编译很慢）"
  Set-Location '$(Join-Path (Split-Path -Parent $BackendRoot) "plant-web-server")'
  cargo run --bin plant-web-server -- --repo-root '$backendRootPs' --config '$configRel'
}
"@
  } else {
    @"
# $($site.label) · web_server 启动器（由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 生成）
# 中继模式（sync_relay_mode = true）：不需要 SurrealDB。长驻进程：在你自己的终端里运行，Ctrl+C 结束。
# cwd 必须是 plant-model-gen（配置里全是相对路径；两站共用 cwd 下的 assets/archives 作 CBA 目录）。
`$ErrorActionPreference = 'Stop'
Set-Location '$backendRootPs'
`$env:ADMIN_USER = '$AdminUser'
`$env:ADMIN_PASS = '$AdminPass'
`$env:WEB_SERVER_PORT = '$($site.port)'
`$exe = '$exePs'
Write-Host "[$($site.key)] :$($site.port) · location $($site.location) · config $configRel.toml · relay（无 SurrealDB）"
if (Test-Path `$exe) {
  & `$exe --config '$configRel'
} else {
  Write-Host "[$($site.key)] 未找到 `$exe，改用 cargo run（首次编译很慢）"
  cargo run --bin web_server --features web_server,relay-sync -- --config '$configRel'
}
"@
  }
  Write-GeneratedFile (Join-Path $siteAbs "start.ps1") $start "launcher"

  # 文件服务 fixture：/files/output → <site>/output
  $now = (Get-Date).ToUniversalTime().ToString("o")
  $metadata = [ordered]@{
    env_id = $null
    env_name = $null
    site_id = $site.location
    site_name = $site.label
    site_http_host = "http://127.0.0.1:$($site.port)/files/output"
    generated_at = $now
    entries = @()
  } | ConvertTo-Json -Depth 4
  Write-GeneratedFile (Join-Path $siteAbs "output\metadata.json") ($metadata + "`n") "fixture"
  Write-GeneratedFile (Join-Path $siteAbs "output\index.html") "<!doctype html><title>$($site.label) file server</title><p>$($site.location) · /files/output</p>`n" "fixture"
}

# CBA 目录 fixture：env.file_server_host 指向 <site>/assets/archives，test-http 对它 GET 要 2xx；
# 两站共用 cwd（plant-model-gen）下的这一个目录，放一个 index.html 让目录请求有 200。
Write-GeneratedFile (Join-Path $BackendRoot "assets\archives\index.html") "<!doctype html><title>CBA archives</title><p>plant-model-gen assets/archives · Sync/E3d 广播的 .cba 从这里下载</p>`n" "fixture"

# Mosquitto
$mosqConf = @"
# 本机双站点 smoke 用 Mosquitto 配置（由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 生成）
listener $MqttPort $MqttHost
allow_anonymous true
persistence false
log_dest stdout
"@
Write-GeneratedFile (Join-Path $runtimeAbs "mosquitto.conf") $mosqConf "mosquitto"
$mosqConfPs = (Join-Path $runtimeAbs "mosquitto.conf").Replace("'", "''")
$mosqStart = @"
# Mosquitto 启动器（由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 生成）· 长驻进程，在自己的终端里跑
`$ErrorActionPreference = 'Stop'
`$candidates = @('$(if ($mosquittoExe) { $mosquittoExe.Replace("'", "''") } else { "mosquitto" })', 'C:\Program Files\mosquitto\mosquitto.exe')
`$exe = `$null
foreach (`$c in `$candidates) { if ((Get-Command `$c -ErrorAction SilentlyContinue) -or (Test-Path `$c)) { `$exe = `$c; break } }
if (-not `$exe) { Write-Error '找不到 mosquitto.exe：winget install --id EclipseFoundation.Mosquitto -e'; exit 2 }
Write-Host "[mosquitto] `$exe -c $mosqConfPs -v"
& `$exe -c '$mosqConfPs' -v
"@
Write-GeneratedFile (Join-Path $runtimeAbs "start-mosquitto.ps1") $mosqStart "mosquitto"

# ---------------------------------------------------------------------------
# 校验生成的 TOML（有 python 就用 tomllib 真解析）
# ---------------------------------------------------------------------------
$validation = @()
if (-not $PrintOnly) {
  foreach ($site in $sites) {
    $cfg = Join-Path (Join-Path $runtimeAbs $site.key) "DbOption.toml"
    if (-not (Test-Path $cfg)) { continue }
    $status = "not-validated"
    $detail = ""
    if ($pythonExe) {
      $py = "import tomllib,sys,json; d=tomllib.load(open(sys.argv[1],'rb')); print(json.dumps({'relay':d.get('sync_relay_mode'),'location':d['location'],'location_dbs':d.get('location_dbs'),'port':d['web_server']['port'],'sqlite':d['deployment_sites_sqlite_path'],'output_root':d['output_root'],'project_path':d.get('project_path'),'included_projects':d.get('included_projects'),'auto_start':d['web_server']['auto_start_surreal'],'file_server_host':d['file_server_host']}))"
      $out = & $pythonExe -c $py $cfg 2>&1
      if ($LASTEXITCODE -eq 0) { $status = "ok"; $detail = "$out" } else { $status = "INVALID"; $detail = "$out" }
    } else {
      # 没有 python：至少查根节点重复键
      $rootKeys = @{}
      foreach ($l in Get-Content $cfg) {
        if ($null -ne (Get-TomlSectionName $l)) { break }
        if ($l -match '^\s*([A-Za-z0-9_]+)\s*=') { $k = $Matches[1]; if ($rootKeys.ContainsKey($k)) { $status = "INVALID"; $detail = "duplicate root key $k" } else { $rootKeys[$k] = 1 } }
      }
      if ($status -ne "INVALID") { $status = "ok (no python; duplicate-key check only)" }
    }
    $validation += [pscustomobject]@{ site = $site.key; status = $status; detail = $detail }
  }
}

# ---------------------------------------------------------------------------
# 输出：文件清单 / 前置 / 命令
# ---------------------------------------------------------------------------
$siteAAbs = Join-Path $runtimeAbs "site-a"
$siteBAbs = Join-Path $runtimeAbs "site-b"
$mosqDirHint = if ($mosquittoPubExe) { Split-Path -Parent $mosquittoPubExe } else { "C:\Program Files\mosquitto" }
$relayFileA = Get-RelayDbFilePath $sites[0]
$relayFileB = Get-RelayDbFilePath $sites[1]
$commands = @"
# 本机双站点 smoke · 启动顺序（每条长驻命令各开一个终端）· SQLite-only 中继模式，不需要 SurrealDB
# 生成时间 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · 后端根目录 $BackendRoot
# 工程：$(if ($ShareProjectPath) { "两站共读 $templateProjectPath（-ShareProjectPath）" } else { "每站一份副本 <site>/project/（$($IncludedProjects -join ', ')）" }) · 演练文件 $RelayDbFile

# 0. 前置（缺什么装什么，装完重开终端）
#    winget install --id EclipseFoundation.Mosquitto -e
#    $backendBuildFix

# 1. MQTT broker（$MqttHost`:$MqttPort）
#    winget 装的 Mosquitto 会以服务 mosquitto 常驻 127.0.0.1:1883（local-only 模式、允许匿名），服务在跑就直接用；
#    要用下面这份自己的配置（stdout 出日志）先 Stop-Service mosquitto，否则 1883 绑不上。
Get-Service mosquitto -ErrorAction SilentlyContinue | Select-Object Status, StartType
powershell -ExecutionPolicy Bypass -File "$(Join-Path $runtimeAbs 'start-mosquitto.ps1')"

# 2. Site A（:$SiteAPort · local-a · 中继 · 自有库 $($sites[0].locationDbs)）
powershell -ExecutionPolicy Bypass -File "$(Join-Path $siteAAbs 'start.ps1')"

# 3. Site B（:$SiteBPort · local-b · 中继 · 自有库 []）
powershell -ExecutionPolicy Bypass -File "$(Join-Path $siteBAbs 'start.ps1')"

# 4. 验证两站都起来了、身份不同、CBA 目录可达
curl http://127.0.0.1:$SiteAPort/api/site/identity
curl http://127.0.0.1:$SiteBPort/api/site/identity
curl http://127.0.0.1:$SiteBPort/files/output/metadata.json
curl http://127.0.0.1:$SiteAPort/assets/archives/

# 5. API 级双站点 smoke（LS-01–LS-24；LS-23/24 = A 回退水位重广播 $RelayDbFile → B clone + 校验）
cd $repoRoot
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 ``
  -SiteABase http://127.0.0.1:$SiteAPort -SiteBBase http://127.0.0.1:$SiteBPort ``
  -FixtureDir "$(Join-Path $siteBAbs 'output')" -MosquittoDir "$mosqDirHint" ``
  -SiteASqlite "$(Join-Path $siteAAbs 'deployment_sites.sqlite')" -SiteBSqlite "$(Join-Path $siteBAbs 'deployment_sites.sqlite')" ``
  -RelayFileA "$relayFileA" -RelayFileB "$relayFileB"

# 6. 监控台 UI 闭环（LF-00–LF-08，对 Site A；会改写 site-a/DbOption.toml 并重启其 watcher + MQTT）
node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:$SiteAPort --mode full --confirm-writes

# 7. 手工看 UI
`$env:VITE_API_TARGET = 'http://127.0.0.1:$SiteAPort'; npm run dev    # → http://localhost:4000/topology

# 8. 看两站台账（中继模式的产物都在 SQLite）
sqlite3 -header -column "$(Join-Path $siteAAbs 'deployment_sites.sqlite')" "SELECT direction, file_name, verify_status, diff_status, sesno_from, sesno_to, sesno_seen FROM e3d_sync_ledger ORDER BY created_at DESC LIMIT 10;"
sqlite3 -header -column "$(Join-Path $siteBAbs 'deployment_sites.sqlite')" "SELECT direction, file_name, verify_status, sesno_to, sesno_seen, verify_detail FROM e3d_sync_ledger ORDER BY created_at DESC LIMIT 10;"
"@
Write-GeneratedFile (Join-Path $runtimeAbs "COMMANDS.md") ("``````powershell`n" + $commands + "`n``````" + "`n") "commands"

Write-Output ""
Write-Output "== 生成结果 =="
$generated | ForEach-Object { Write-Output ("  [{0,-9}] {1,-12} {2}" -f $_.kind, $_.action, $_.path) }
if ($validation.Count -gt 0) {
  Write-Output ""
  Write-Output "== TOML 校验 =="
  $validation | ForEach-Object { Write-Output ("  {0}: {1} {2}" -f $_.site, $_.status, $_.detail) }
}
Write-Output ""
Write-Output "== 前置检查 =="
foreach ($p in $prereqs) {
  $mark = if ($p.ok) { "OK  " } else { "MISS" }
  Write-Output ("  [{0}] {1}" -f $mark, $p.item)
  if ($p.ok) { Write-Output ("         {0}" -f $p.detail) } else { Write-Output ("         → {0}" -f $p.fix) }
}
Write-Output ""
Write-Output "== 启动命令（也写在 $(Join-Path $runtimeAbs 'COMMANDS.md')）=="
Write-Output $commands

$missing = @($prereqs | Where-Object { -not $_.ok -and $_.fix -ne "可选" })
if ($validation | Where-Object { $_.status -eq "INVALID" }) { exit 1 }
if ($missing.Count -gt 0) { exit 3 }
exit 0

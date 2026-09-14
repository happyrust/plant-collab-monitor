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
  [string]$SurrealBin = "",
  [string]$MosquittoDir = "",
  [string]$AdminUser = "admin",
  [string]$AdminPass = "admin",
  [switch]$VersionedStorage,
  [switch]$Force,
  [switch]$PrintOnly,
  [switch]$Help
)

# 本机双站点异地协同环境生成器（计划 P3 步骤 2 的自动化版本）
#
# 以 ../plant-model-gen/db_options/DbOption.toml 为模板，生成两份彼此隔离的站点配置：
#   <BackendRoot>/runtime/local-collab/site-a/DbOption.toml   (:4100 · location local-a · SurrealDB :8021)
#   <BackendRoot>/runtime/local-collab/site-b/DbOption.toml   (:4101 · location local-b · SurrealDB :8022)
# 并写出每个站点的 start.ps1、Mosquitto 配置 + start-mosquitto.ps1、Site B 文件服务 fixture
# （output/index.html + output/metadata.json，供 test-http / sites/{id}/test-http 探测），
# 最后打印按顺序要在各自终端里执行的命令（长驻进程不由本脚本拉起）。
#
# 隔离项（对齐 docs/e2e-smoke/local-remote-collab-test-plan.md §3）：
#   location / file_server_host / deployment_sites_sqlite_path / output_root /
#   [web_server].port|bind_host|site_id|site_name|region|surreal_bind|surreal_data_path /
#   [surrealdb].ip|port|path（每站点自己的 SurrealDB 进程 + 数据目录）
#
# SurrealDB：当前 web_server.exe 只编了 kv-mem（未编 kv-rocksdb，见 plant-model-gen/Cargo.toml），
# 所以嵌入式 file 模式不可用，站点配置一律走 auto_start_surreal = true 由 web_server 自己拉起
# `surreal start`。默认 versioned_storage = false（官方 surreal 二进制不认识 fork 的 versioned 参数）；
# 用 happyrust/surrealdb fork 构建的 surreal 时加 -VersionedStorage。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -Force        # 覆盖已生成的文件
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -PrintOnly    # 只打印命令
#   powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-setup.ps1 -SurrealBin "C:\Program Files\SurrealDB\surreal.exe" -MosquittoDir "C:\Program Files\mosquitto"

$ErrorActionPreference = "Stop"

if ($Help) {
  Get-Content $PSCommandPath | Select-Object -Skip 21 -First 30 | ForEach-Object { $_ -replace '^# ?', '' }
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

if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { "D:\Rust\target" }
  $ExePath = Join-Path $targetDir "debug\web_server.exe"
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
$surrealDirs = @("C:\Program Files\SurrealDB", (Join-Path $env:USERPROFILE ".surrealdb"), (Join-Path $env:LOCALAPPDATA "Programs\SurrealDB"))
$surrealExe = if (-not [string]::IsNullOrWhiteSpace($SurrealBin)) { $SurrealBin } else { Find-Executable "surreal" $surrealDirs }
$pythonExe = Find-Executable "python" @()

$prereqs = @(
  [pscustomobject]@{ item = "web_server.exe（web_server,mqtt）"; ok = (Test-Path $ExePath); detail = $ExePath; fix = "cd $BackendRoot; cargo build --bin web_server --features web_server,mqtt" },
  [pscustomobject]@{ item = "mosquitto（broker）"; ok = ($null -ne $mosquittoExe); detail = $mosquittoExe; fix = "winget install --id EclipseFoundation.Mosquitto -e   # 装到 C:\Program Files\mosquitto，不进 PATH" },
  [pscustomobject]@{ item = "mosquitto_pub（smoke LS-18 用）"; ok = ($null -ne $mosquittoPubExe); detail = $mosquittoPubExe; fix = "同上；smoke 用 -MosquittoDir 'C:\Program Files\mosquitto' 指定" },
  [pscustomobject]@{ item = "surreal（每站点自启 SurrealDB）"; ok = ($null -ne $surrealExe -and (Test-Path $surrealExe)); detail = $surrealExe; fix = "iwr https://windows.surrealdb.com -useb | iex   # 官方安装脚本；装完重开终端或用 -SurrealBin 指定完整路径" },
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
  [pscustomobject]@{ key = "site-a"; label = "Local Site A"; location = "local-a"; port = $SiteAPort; surrealPort = $SiteASurrealPort; locationDbs = "[251181]" },
  [pscustomobject]@{ key = "site-b"; label = "Local Site B"; location = "local-b"; port = $SiteBPort; surrealPort = $SiteBSurrealPort; locationDbs = "[]" }
)

$templateLines = Get-Content (Join-Path $BackendRoot $Template) -Encoding UTF8
$generated = [System.Collections.Generic.List[object]]::new()

function New-SiteConfigText($Site) {
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# 由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 生成")
  $lines.Add("# 模板：$Template · 站点：$($Site.key)（$($Site.location) · :$($Site.port) · SurrealDB :$($Site.surrealPort)）")
  $lines.Add("# 仅供本机双站点 smoke 使用；activate 会改写本文件的 mqtt_host / mqtt_port / file_server_host / location / location_dbs")
  foreach ($l in $templateLines) { $lines.Add($l) }

  $siteDir = "$runtimeRel/$($Site.key)"
  $base = "http://127.0.0.1:$($Site.port)"
  $surrealData = "$siteDir/surreal.db"

  # 根节点
  Set-TomlValue $lines "" "location" (ConvertTo-TomlString $Site.location) | Out-Null
  Set-TomlValue $lines "" "location_dbs" $Site.locationDbs | Out-Null
  Set-TomlValue $lines "" "mqtt_host" (ConvertTo-TomlString $MqttHost) | Out-Null
  Set-TomlValue $lines "" "mqtt_port" "$MqttPort" | Out-Null
  Set-TomlValue $lines "" "file_server_host" (ConvertTo-TomlString "$base/files/output") | Out-Null
  Set-TomlValue $lines "" "remote_file_server_hosts" "[]" | Out-Null
  Set-TomlValue $lines "" "deployment_sites_sqlite_path" (ConvertTo-TomlString "$siteDir/deployment_sites.sqlite") | Out-Null
  Set-TomlValue $lines "" "output_root" (ConvertTo-TomlString "$siteDir/output") | Out-Null
  # smoke 不需要模型 / 空间树，关掉以免启动期触发 Scene Tree 构建
  Set-TomlValue $lines "" "gen_model" "false" | Out-Null
  Set-TomlValue $lines "" "gen_mesh" "false" | Out-Null
  Set-TomlValue $lines "" "gen_spatial_tree" "false" | Out-Null
  Set-TomlValue $lines "" "versioned_storage" ($(if ($VersionedStorage) { "true" } else { "false" })) | Out-Null
  # rs-core 旧路径仍读这几个根键连 ws SurrealDB
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
  Set-TomlValue $lines "web_server" "auto_start_surreal" "true" | Out-Null
  Set-TomlValue $lines "web_server" "surreal_bin" (ConvertTo-TomlString $(if ($surrealExe) { $surrealExe } else { "surreal" })) | Out-Null
  Set-TomlValue $lines "web_server" "surreal_data_path" (ConvertTo-TomlString $surrealData) | Out-Null
  Set-TomlValue $lines "web_server" "surreal_bind" (ConvertTo-TomlString "127.0.0.1:$($Site.surrealPort)") | Out-Null

  # [surrealdb]
  Set-TomlValue $lines "surrealdb" "mode" '"ws"' | Out-Null
  Set-TomlValue $lines "surrealdb" "ip" '"127.0.0.1"' | Out-Null
  Set-TomlValue $lines "surrealdb" "port" "$($Site.surrealPort)" | Out-Null
  Set-TomlValue $lines "surrealdb" "path" (ConvertTo-TomlString $surrealData) | Out-Null

  return ($lines -join "`n") + "`n"
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

  Write-GeneratedFile (Join-Path $siteAbs "DbOption.toml") (New-SiteConfigText $site) "config"

  $start = @"
# $($site.label) · web_server 启动器（由 plant-collab-monitor/scripts/local-remote-collab-setup.ps1 生成）
# 长驻进程：在你自己的终端里运行，Ctrl+C 结束。cwd 必须是 plant-model-gen（配置里全是相对路径）。
`$ErrorActionPreference = 'Stop'
Set-Location '$backendRootPs'
`$env:ADMIN_USER = '$AdminUser'
`$env:ADMIN_PASS = '$AdminPass'
`$env:WEB_SERVER_PORT = '$($site.port)'
`$exe = '$exePs'
Write-Host "[$($site.key)] :$($site.port) · location $($site.location) · config $configRel.toml · SurrealDB :$($site.surrealPort)"
if (Test-Path `$exe) {
  & `$exe --config '$configRel'
} else {
  Write-Host "[$($site.key)] 未找到 `$exe，改用 cargo run（首次编译很慢）"
  cargo run --bin web_server --features web_server,mqtt -- --config '$configRel'
}
"@
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
      $py = "import tomllib,sys,json; d=tomllib.load(open(sys.argv[1],'rb')); print(json.dumps({'location':d['location'],'port':d['web_server']['port'],'sqlite':d['deployment_sites_sqlite_path'],'output_root':d['output_root'],'surreal':d['surrealdb']['port'],'auto_start':d['web_server']['auto_start_surreal'],'file_server_host':d['file_server_host']}))"
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
$commands = @"
# 本机双站点 smoke · 启动顺序（每条长驻命令各开一个终端）
# 生成时间 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · 后端根目录 $BackendRoot

# 0. 前置（缺什么装什么，装完重开终端）
#    winget install --id EclipseFoundation.Mosquitto -e
#    iwr https://windows.surrealdb.com -useb | iex
#    cd $BackendRoot; cargo build --bin web_server --features web_server,mqtt

# 1. MQTT broker（$MqttHost`:$MqttPort）
powershell -ExecutionPolicy Bypass -File "$(Join-Path $runtimeAbs 'start-mosquitto.ps1')"

# 2. Site A（:$SiteAPort · local-a · 自启 SurrealDB :$SiteASurrealPort）
powershell -ExecutionPolicy Bypass -File "$(Join-Path $siteAAbs 'start.ps1')"

# 3. Site B（:$SiteBPort · local-b · 自启 SurrealDB :$SiteBSurrealPort）
powershell -ExecutionPolicy Bypass -File "$(Join-Path $siteBAbs 'start.ps1')"

# 4. 验证两站都起来了、身份不同
curl http://127.0.0.1:$SiteAPort/api/site/identity
curl http://127.0.0.1:$SiteBPort/api/site/identity
curl http://127.0.0.1:$SiteBPort/files/output/metadata.json

# 5. API 级双站点 smoke（LS-01–LS-22；fixture 落到 Site B 的文件服务目录）
cd $repoRoot
powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 ``
  -SiteABase http://127.0.0.1:$SiteAPort -SiteBBase http://127.0.0.1:$SiteBPort ``
  -FixtureDir "$(Join-Path $siteBAbs 'output')" -MosquittoDir "$mosqDirHint"

# 6. 监控台 UI 闭环（LF-00–LF-08，对 Site A；会改写 site-a/DbOption.toml 并重启其 watcher + MQTT）
node scripts/topology-deploy-live-smoke.mjs --api http://127.0.0.1:$SiteAPort --mode full --confirm-writes

# 7. 手工看 UI
`$env:VITE_API_TARGET = 'http://127.0.0.1:$SiteAPort'; npm run dev    # → http://localhost:4000/topology
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

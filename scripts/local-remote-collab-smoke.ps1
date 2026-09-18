param(
  [string]$SiteABase = "",
  [string]$SiteBBase = "",
  [string]$MqttHost = "",
  [int]$MqttPort = 0,
  [string]$AdminUser = "",
  [string]$AdminPass = "",
  [string]$ReportPath = "",
  [string]$FixtureDir = "",
  [string]$FixtureFileName = "",
  [int]$AppendBytes = 0,
  [string]$SiteBFileServerHost = "",
  [string]$SiteBHttpHost = "",
  [string]$MosquittoDir = "",
  [int]$MqttReceiveTimeoutSec = 0,
  [string]$SiteAArchivesHost = "",
  [string]$SiteBArchivesHost = "",
  [string]$SiteASqlite = "",
  [string]$SiteBSqlite = "",
  [string]$RelayFileA = "",
  [string]$RelayFileB = "",
  [int]$RelayRewindSessions = 0,
  [int]$RelayDetectIntervalSec = 0,
  [int]$RelayTimeoutSec = 0,
  [string]$SqliteExe = "",
  [switch]$KeepEnv,
  [switch]$FixtureOnly,
  [switch]$SkipMqttPublish,
  [switch]$SkipRelay,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Output "Local remote-collab smoke test (SQLite-only relay mode: two relay sites, no SurrealDB)"
  Write-Output ""
  Write-Output "Prerequisites:"
  Write-Output "  - Site A web_server is running, default http://127.0.0.1:4100 (sync_relay_mode = true)"
  Write-Output "  - Site B web_server is running, default http://127.0.0.1:4101 (sync_relay_mode = true)"
  Write-Output "  - MQTT broker is running, default 127.0.0.1:1883"
  Write-Output "  - Site A/B use isolated DbOption.toml, deployment_sites_sqlite_path, location, project copy (setup script)"
  Write-Output "  - sqlite3.exe (or python) for LS-23/24, which read both sites' e3d_sync_ledger / relay_sync_watermark"
  Write-Output ""
  Write-Output "Usage:"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -SiteABase http://127.0.0.1:4100 -SiteBBase http://127.0.0.1:4101"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -FixtureOnly -FixtureDir `$env:TEMP\remote-collab-fixture"
  Write-Output ""
  Write-Output "Checks (LS-01..LS-25 in report order, see docs/e2e-smoke/local-remote-collab-test-plan.md section 6):"
  Write-Output "  ports / identities / login / env+site create / test-mqtt / test-http / activate / runtime status / topology / logs"
  Write-Output "  LS-15 remote-runtime-active-env      : runtime/status.active == true && env_id == created env (pws: envs[].active)"
  Write-Output "  LS-20 mqtt-received-after-publish    : after mosquitto_pub, runtime/status.mqtt_connected turns true"
  Write-Output "  LS-22 runtime-stop-clears-active     : POST runtime/stop -> runtime/status.active == false, then delete smoke site/env (skipped with -KeepEnv)"
  Write-Output "  LS-23 relay-outbound-ledger          : activate Site B too, rewind Site A's relay watermark for -RelayFileB's db by N sessions,"
  Write-Output "                                         Site A's relay loop re-broadcasts it -> e3d_sync_ledger outbound/ok row on A"
  Write-Output "  LS-24 relay-inbound-ledger           : Site B receives it, clones + verifies -> inbound/ok row on B with sesno_seen == sesno_to;"
  Write-Output "                                         B's copy (garbage appended beforehand) is restored (SHA256 == -RelayFileA when given)"
  Write-Output "  LS-25 relay-ledger-api               : GET /api/remote-sync/ledger?direction=outbound&msg_id=<LS-23 msg_id> on A is exactly 1 ok row whose"
  Write-Output "                                         changes_count and rows/{id}/changes.total equal sqlite3's e3d_sync_changes count; B has 1 inbound/ok row"
  Write-Output "                                         for the same msg_id (skipped when the backend has no ledger API, i.e. 404)"
  Write-Output ""
  Write-Output "Options:"
  Write-Output "  -SiteAArchivesHost     env.file_server_host written on Site A = where others download A's .cba (default <SiteABase>/assets/archives)"
  Write-Output "  -SiteBArchivesHost     same for the env created on Site B (default <SiteBBase>/assets/archives)"
  Write-Output "  -SiteBHttpHost         site.http_host (default <SiteBBase>/files/output; backend probes <http_host>/metadata.json)"
  Write-Output "  -SiteBFileServerHost   deprecated alias of -SiteAArchivesHost (kept for old command lines)"
  Write-Output "  -SiteASqlite/-SiteBSqlite  deployment_sites.sqlite of each site (default ../plant-model-gen/runtime/local-collab/site-x/deployment_sites.sqlite)"
  Write-Output "  -RelayFileA/-RelayFileB    the db file used for LS-23/24: A's source and B's copy (default <site-x>/project/SCB/scb000/scb6000_0001)"
  Write-Output "  -RelayRewindSessions   how many sessions to rewind A's watermark (default 1)"
  Write-Output "  -RelayDetectIntervalSec relay poll interval set on both smoke envs via envs/{id}/config (default 5)"
  Write-Output "  -RelayTimeoutSec       max seconds to wait for each of LS-23 / LS-24 (default 90)"
  Write-Output "  -SqliteExe             sqlite3.exe path when not on PATH (falls back to python's sqlite3 module)"
  Write-Output "  -SkipRelay             record LS-23/24 as skipped"
  Write-Output "  -MosquittoDir          folder holding mosquitto_pub.exe when it is not on PATH (default probes C:\Program Files\mosquitto)"
  Write-Output "  -MqttReceiveTimeoutSec seconds to wait for mqtt_connected after publish (default 20)"
  Write-Output "  -KeepEnv               do not stop the runtimes / delete the smoke envs + site at the end"
  Write-Output ""
  Write-Output "Environment overrides:"
  Write-Output "  SITE_A_BASE, SITE_B_BASE, MQTT_HOST, MQTT_PORT, ADMIN_USER, ADMIN_PASS, SMOKE_JSON_REPORT"
  Write-Output "  SMOKE_FIXTURE_DIR, SMOKE_FIXTURE_FILE, SMOKE_APPEND_BYTES, SITE_A_ARCHIVES_HOST, SITE_B_ARCHIVES_HOST, SITE_B_HTTP_HOST, MOSQUITTO_DIR"
  Write-Output "  SITE_A_SQLITE, SITE_B_SQLITE, RELAY_FILE_A, RELAY_FILE_B, SQLITE_EXE"
}

if ($Help) {
  Show-Help
  exit 0
}

function Get-ValueOrDefault([string]$Value, [string]$EnvName, [string]$DefaultValue) {
  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return $Value
  }
  $envValue = [Environment]::GetEnvironmentVariable($EnvName)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) {
    return $envValue
  }
  return $DefaultValue
}

function Get-IntOrDefault([int]$Value, [string]$EnvName, [int]$DefaultValue) {
  if ($Value -gt 0) {
    return $Value
  }
  $envValue = [Environment]::GetEnvironmentVariable($EnvName)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) {
    $parsed = 0
    if ([int]::TryParse($envValue, [ref]$parsed) -and $parsed -gt 0) {
      return $parsed
    }
  }
  return $DefaultValue
}

function Join-Url([string]$Base, [string]$Path) {
  return $Base.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function Get-ObjectValue($Object, [string[]]$Names) {
  if ($null -eq $Object) {
    return $null
  }
  foreach ($name in $Names) {
    if ($Object -is [System.Collections.IDictionary] -and $Object.Contains($name)) {
      return $Object[$name]
    }
    $property = $Object.PSObject.Properties[$name]
    if ($null -ne $property) {
      return $property.Value
    }
  }
  return $null
}

function Get-NestedValue($Object, [string[]]$Path) {
  $current = $Object
  foreach ($segment in $Path) {
    $current = Get-ObjectValue $current @($segment)
    if ($null -eq $current) {
      return $null
    }
  }
  return $current
}

function Add-Check([System.Collections.Generic.List[object]]$Checks, [string]$Name, [string]$Status, [object]$Details) {
  $Checks.Add([pscustomobject]@{
      name = $Name
      status = $Status
      details = $Details
    }) | Out-Null
}

function Invoke-SmokeJson([string]$Method, [string]$Url, [object]$Body, [hashtable]$Headers) {
  try {
    $params = @{
      Method = $Method
      Uri = $Url
      TimeoutSec = 10
    }
    if ($null -ne $Headers -and $Headers.Count -gt 0) {
      $params.Headers = $Headers
    }
    if ($null -ne $Body) {
      $params.ContentType = "application/json"
      $params.Body = ($Body | ConvertTo-Json -Depth 12)
    }
    $response = Invoke-RestMethod @params
    return [pscustomobject]@{ ok = $true; response = $response; error = $null }
  } catch {
    return [pscustomobject]@{ ok = $false; response = $null; error = $_.Exception.Message }
  }
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(1500, $false)
    if ($connected) {
      $client.EndConnect($async)
    }
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

function Get-BaseHostPort([string]$BaseUrl) {
  $uri = [Uri]$BaseUrl
  return [pscustomobject]@{
    host = $uri.Host
    port = $uri.Port
  }
}

function Get-TokenFromLoginResponse($Response) {
  $token = Get-NestedValue $Response @("data", "token")
  if ($null -ne $token) {
    return [string]$token
  }
  $token = Get-ObjectValue $Response @("token", "access_token")
  if ($null -ne $token) {
    return [string]$token
  }
  return ""
}

function Get-EntityId($Response) {
  $id = Get-ObjectValue $Response @("id", "env_id", "site_id")
  if ($null -ne $id) {
    return [string]$id
  }
  foreach ($path in @(
      @("data", "id"),
      @("data", "env_id"),
      @("data", "site_id"),
      @("env", "id"),
      @("site", "id")
    )) {
    $nested = Get-NestedValue $Response $path
    if ($null -ne $nested) {
      return [string]$nested
    }
  }
  return ""
}

function Get-FirstTopic($Response) {
  $topics = Get-ObjectValue $Response @("subscribed_topics", "topics")
  if ($null -ne $topics -and $topics.Count -gt 0) {
    return [string]$topics[0]
  }
  $topic = Get-ObjectValue $Response @("topic")
  if ($null -ne $topic) {
    return [string]$topic
  }
  return "Sync/E3d"
}

# 中继站点的轮询每个周期都会打开同一批 db 文件（db_index 扫描 + e3d-io），
# 那几百毫秒里对文件的任何读写都会被 Windows 拒绝；等它放手再试。
function Invoke-WithFileRetry([scriptblock]$Action, $Path, [int]$Attempts = 30, [int]$DelayMs = 500) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      return (& $Action $Path)
    } catch {
      if ($i -eq $Attempts) { throw }
      Start-Sleep -Milliseconds $DelayMs
    }
  }
}

function Write-IncrementalFixture([string]$Directory, [string]$FileName, [int]$BytesToAppend) {
  New-Item -ItemType Directory -Force -Path $Directory | Out-Null
  $path = Join-Path $Directory $FileName
  $bytes = New-Object byte[] $BytesToAppend
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }

  $stream = Invoke-WithFileRetry { param($p) [System.IO.File]::Open($p, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read) } $path
  try {
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $stream.Dispose()
  }

  $item = Get-Item $path
  $hash = Invoke-WithFileRetry { param($p) Get-FileHash -Algorithm SHA256 -Path $p -ErrorAction Stop } $path
  return [pscustomobject]@{
    path = $item.FullName
    file_name = $FileName
    appended_bytes = $BytesToAppend
    length = $item.Length
    sha256 = $hash.Hash
    updated_at = $item.LastWriteTimeUtc.ToString("o")
  }
}

$SiteABase = Get-ValueOrDefault $SiteABase "SITE_A_BASE" "http://127.0.0.1:4100"
$SiteBBase = Get-ValueOrDefault $SiteBBase "SITE_B_BASE" "http://127.0.0.1:4101"
$MqttHost = Get-ValueOrDefault $MqttHost "MQTT_HOST" "127.0.0.1"
$MqttPort = Get-IntOrDefault $MqttPort "MQTT_PORT" 1883
$AdminUser = Get-ValueOrDefault $AdminUser "ADMIN_USER" "admin"
$AdminPass = Get-ValueOrDefault $AdminPass "ADMIN_PASS" "admin"
$ReportPath = Get-ValueOrDefault $ReportPath "SMOKE_JSON_REPORT" "docs/e2e-smoke/local-remote-collab-smoke-result.json"
$FixtureDir = Get-ValueOrDefault $FixtureDir "SMOKE_FIXTURE_DIR" "runtime/local-remote-collab/site-b-files"
$FixtureFileName = Get-ValueOrDefault $FixtureFileName "SMOKE_FIXTURE_FILE" "local-smoke-increment.e3d"
$AppendBytes = Get-IntOrDefault $AppendBytes "SMOKE_APPEND_BYTES" 512
# env.file_server_host 的真实语义（plant-model-gen）：本站广播 SyncE3dFileMsg 时带上它，**对端**从 <file_server_host>/<file>.cba
# 下载本站的 CBA；web_server 把 assets/archives 挂在 /assets/archives。test-http 对它 GET 要 2xx（setup 放了 index.html）。
# sites/{id}/test-http 取 <http_host>/metadata.json，所以站点的 http_host 仍指 Site B 的 /files/output。
$SiteAArchivesHost = Get-ValueOrDefault $SiteAArchivesHost "SITE_A_ARCHIVES_HOST" ""
if ([string]::IsNullOrWhiteSpace($SiteAArchivesHost)) {
  # 旧参数 -SiteBFileServerHost 曾被写进 A 的 env.file_server_host；给了就沿用，否则用正确的默认值
  $SiteAArchivesHost = Get-ValueOrDefault $SiteBFileServerHost "SITE_B_FILE_SERVER_HOST" ($SiteABase.TrimEnd("/") + "/assets/archives")
}
$SiteBArchivesHost = Get-ValueOrDefault $SiteBArchivesHost "SITE_B_ARCHIVES_HOST" ($SiteBBase.TrimEnd("/") + "/assets/archives")
$SiteBHttpHost = Get-ValueOrDefault $SiteBHttpHost "SITE_B_HTTP_HOST" ($SiteBBase.TrimEnd("/") + "/files/output")
$MosquittoDir = Get-ValueOrDefault $MosquittoDir "MOSQUITTO_DIR" ""
$MqttReceiveTimeoutSec = Get-IntOrDefault $MqttReceiveTimeoutSec "SMOKE_MQTT_RECEIVE_TIMEOUT_SEC" 20

# LS-23/24（中继链路）：两站的 SQLite 与演练用 db 文件。默认按 setup 脚本的落盘约定（后端与本仓同级）。
$backendRootGuess = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "plant-model-gen"
$SiteASqlite = Get-ValueOrDefault $SiteASqlite "SITE_A_SQLITE" (Join-Path $backendRootGuess "runtime\local-collab\site-a\deployment_sites.sqlite")
$SiteBSqlite = Get-ValueOrDefault $SiteBSqlite "SITE_B_SQLITE" (Join-Path $backendRootGuess "runtime\local-collab\site-b\deployment_sites.sqlite")
$RelayFileA = Get-ValueOrDefault $RelayFileA "RELAY_FILE_A" (Join-Path $backendRootGuess "runtime\local-collab\site-a\project\SCB\scb000\scb6000_0001")
$RelayFileB = Get-ValueOrDefault $RelayFileB "RELAY_FILE_B" (Join-Path $backendRootGuess "runtime\local-collab\site-b\project\SCB\scb000\scb6000_0001")
$RelayRewindSessions = Get-IntOrDefault $RelayRewindSessions "RELAY_REWIND_SESSIONS" 1
$RelayDetectIntervalSec = Get-IntOrDefault $RelayDetectIntervalSec "RELAY_DETECT_INTERVAL_SEC" 5
$RelayTimeoutSec = Get-IntOrDefault $RelayTimeoutSec "RELAY_TIMEOUT_SEC" 90
$SqliteExe = Get-ValueOrDefault $SqliteExe "SQLITE_EXE" ""

# ---------------------------------------------------------------------------
# SQLite 只读 / 小写：优先 sqlite3.exe（-json），没有就用 python 的 sqlite3 模块
# ---------------------------------------------------------------------------
function Find-SqliteTool([string]$Preferred) {
  if (-not [string]::IsNullOrWhiteSpace($Preferred) -and (Test-Path $Preferred)) { return [pscustomobject]@{ kind = "sqlite3"; path = $Preferred } }
  $cmd = Get-Command "sqlite3" -ErrorAction SilentlyContinue
  if ($null -ne $cmd) { return [pscustomobject]@{ kind = "sqlite3"; path = $cmd.Source } }
  $py = Get-Command "python" -ErrorAction SilentlyContinue
  if ($null -ne $py) { return [pscustomobject]@{ kind = "python"; path = $py.Source } }
  return $null
}

# 返回行数组（每行一个 PSCustomObject）；SQL 里的参数由调用方自己转义（只传我们自己拼的字面量）
function Invoke-SqliteQuery($Tool, [string]$DbPath, [string]$Sql) {
  if ($null -eq $Tool) { throw "no sqlite tool" }
  if ($Tool.kind -eq "sqlite3") {
    $raw = & $Tool.path -json $DbPath $Sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw ("sqlite3 failed: " + ($raw -join " ")) }
    $text = ($raw -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return @() }
    # PS 5.1 的 ConvertFrom-Json 把整个 JSON 数组当成一个对象往下传，直接 @(...) 会得到「一个元素、里面是数组」；
    # 先落到变量再展开，否则多行结果上 $rows[0] 拿到的是全部行。
    $parsed = ConvertFrom-Json $text
    if ($null -eq $parsed) { return @() }
    return @($parsed)
  }
  $script = "import sqlite3,sys,json`nc=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row`nrows=[dict(r) for r in c.execute(sys.argv[2])]`nc.commit();print(json.dumps(rows))"
  $raw = & $Tool.path -c $script $DbPath $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw ("python sqlite3 failed: " + ($raw -join " ")) }
  $text = ($raw -join "`n").Trim()
  if ([string]::IsNullOrWhiteSpace($text) -or $text -eq "[]") { return @() }
  $parsed = ConvertFrom-Json $text
  if ($null -eq $parsed) { return @() }
  return @($parsed)
}

function ConvertTo-SqlLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Get-FileSha256([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return (Invoke-WithFileRetry { param($p) Get-FileHash -Algorithm SHA256 -Path $p -ErrorAction Stop } $Path).Hash
}

function Find-MosquittoPub([string]$Dir) {
  $cmd = Get-Command "mosquitto_pub" -ErrorAction SilentlyContinue
  if ($null -ne $cmd) { return $cmd.Source }
  foreach ($candidate in @($Dir, "C:\Program Files\mosquitto", "C:\Program Files (x86)\mosquitto")) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $exe = Join-Path $candidate "mosquitto_pub.exe"
    if (Test-Path $exe) { return $exe }
  }
  return $null
}

function Get-ActiveEnvIdFromEnvsResponse($Response) {
  # plant-web-server：顶层 active.id 或 items[].active == true
  $active = Get-NestedValue $Response @("active", "id")
  if ($null -ne $active) { return [string]$active }
  $items = Get-ObjectValue $Response @("items")
  if ($null -ne $items) {
    foreach ($item in $items) {
      if ((Get-ObjectValue $item @("active")) -eq $true) { return [string](Get-ObjectValue $item @("id")) }
    }
  }
  return ""
}

if ($FixtureOnly) {
  try {
    $fixtureOnlyResult = Write-IncrementalFixture $FixtureDir $FixtureFileName $AppendBytes
    $fixtureReport = [pscustomobject]@{
      passed = $true
      mode = "fixture-only"
      fixture = $fixtureOnlyResult
      finished_at = (Get-Date).ToUniversalTime().ToString("o")
    }
    $fixtureReportDir = Split-Path -Parent $ReportPath
    if (-not [string]::IsNullOrWhiteSpace($fixtureReportDir)) {
      New-Item -ItemType Directory -Force -Path $fixtureReportDir | Out-Null
    }
    $fixtureReport | ConvertTo-Json -Depth 12 | Set-Content -Path $ReportPath -Encoding UTF8
    Write-Output "Incremental fixture appended."
    Write-Output ("  file          : {0}" -f $fixtureOnlyResult.path)
    Write-Output ("  appended bytes: {0}" -f $fixtureOnlyResult.appended_bytes)
    Write-Output ("  total bytes   : {0}" -f $fixtureOnlyResult.length)
    Write-Output ("  sha256        : {0}" -f $fixtureOnlyResult.sha256)
    Write-Output ("  report        : {0}" -f $ReportPath)
    exit 0
  } catch {
    Write-Error ("FixtureOnly failed: {0}" -f $_.Exception.Message)
    exit 1
  }
}

$checks = [System.Collections.Generic.List[object]]::new()
$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$headers = @{}
$envId = ""
$siteId = ""
$topic = ""
$fixture = $null

$siteA = Get-BaseHostPort $SiteABase
$siteB = Get-BaseHostPort $SiteBBase

Add-Check $checks "site-a-port" ($(if (Test-TcpPort $siteA.host $siteA.port) { "passed" } else { "failed" })) @{ base = $SiteABase }
Add-Check $checks "site-b-port" ($(if (Test-TcpPort $siteB.host $siteB.port) { "passed" } else { "failed" })) @{ base = $SiteBBase }
Add-Check $checks "mqtt-port" ($(if (Test-TcpPort $MqttHost $MqttPort) { "passed" } else { "failed" })) @{ host = $MqttHost; port = $MqttPort }

$siteAIdentity = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/site/identity") $null @{}
Add-Check $checks "site-a-identity" ($(if ($siteAIdentity.ok) { "passed" } else { "failed" })) @{ url = (Join-Url $SiteABase "/api/site/identity"); error = $siteAIdentity.error; response = $siteAIdentity.response }

$siteBIdentity = Invoke-SmokeJson "GET" (Join-Url $SiteBBase "/api/site/identity") $null @{}
Add-Check $checks "site-b-identity" ($(if ($siteBIdentity.ok) { "passed" } else { "failed" })) @{ url = (Join-Url $SiteBBase "/api/site/identity"); error = $siteBIdentity.error; response = $siteBIdentity.response }

$siteALocation = Get-ObjectValue $siteAIdentity.response @("region", "site_id", "location")
if ([string]::IsNullOrWhiteSpace([string]$siteALocation)) {
  $siteALocation = "local-a"
}
$siteBLocation = Get-ObjectValue $siteBIdentity.response @("region", "site_id", "location")
if ([string]::IsNullOrWhiteSpace([string]$siteBLocation)) {
  $siteBLocation = "local-b"
}

Add-Check $checks "site-identity-distinct" ($(if ($siteAIdentity.ok -and $siteBIdentity.ok -and $siteALocation -ne $siteBLocation) { "passed" } else { "failed" })) @{
  site_a = $siteALocation
  site_b = $siteBLocation
}

$login = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/admin/auth/login") @{ username = $AdminUser; password = $AdminPass } @{}
if ($login.ok) {
  $token = Get-TokenFromLoginResponse $login.response
  if (-not [string]::IsNullOrWhiteSpace($token)) {
    $headers = @{ Authorization = "Bearer $token" }
  }
}
Add-Check $checks "site-a-admin-login" ($(if ($login.ok -and $headers.ContainsKey("Authorization")) { "passed" } else { "failed" })) @{
  url = (Join-Url $SiteABase "/api/admin/auth/login")
  error = $login.error
}

# activate 会把 env 的 location / location_dbs 写回站点 toml：把 Site A 当前的 location_dbs（自有库）原样带上，
# 否则会被清成 []，中继就会把收到的别家文件也当自有库再广播出去。
function Get-RuntimeLocationDbs([string]$Base, [hashtable]$Hdrs) {
  $cfg = Invoke-SmokeJson "GET" (Join-Url $Base "/api/remote-sync/runtime/config") $null $Hdrs
  if (-not $cfg.ok) { return $null }
  $dbs = Get-NestedValue $cfg.response @("config", "location_dbs")
  if ($null -eq $dbs) { return $null }
  $list = @($dbs | ForEach-Object { [string]$_ })
  if ($list.Count -eq 0) { return $null }
  return ($list -join ",")
}

# 把 smoke env 的 detect_interval 调小，LS-23/24 才不用等 30 s 一轮
function Set-EnvDetectInterval([string]$Base, [hashtable]$Hdrs, [string]$Id, [int]$Seconds) {
  $current = Invoke-SmokeJson "GET" (Join-Url $Base "/api/remote-sync/envs/$Id/config") $null $Hdrs
  $cfg = [ordered]@{
    auto_detect = $true; detect_interval = $Seconds; auto_sync = $false; batch_size = 10; max_concurrent = 3
    reconnect_initial_ms = 1000; reconnect_max_ms = 30000; enable_notifications = $true; log_retention_days = 30
  }
  if ($current.ok -and $null -ne $current.response) {
    foreach ($key in @($cfg.Keys)) {
      if ($key -eq "detect_interval") { continue }
      $value = Get-ObjectValue $current.response @($key)
      if ($null -ne $value) { $cfg[$key] = $value }
    }
  }
  return Invoke-SmokeJson "PUT" (Join-Url $Base "/api/remote-sync/envs/$Id/config") $cfg $Hdrs
}

$siteALocationDbs = Get-RuntimeLocationDbs $SiteABase $headers
$envName = "local-dual-site-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$envPayload = @{
  name = $envName
  mqtt_host = $MqttHost
  mqtt_port = $MqttPort
  file_server_host = $SiteAArchivesHost
  location = $siteALocation
  location_dbs = $siteALocationDbs
}
$createEnv = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/envs") $envPayload $headers
if ($createEnv.ok) {
  $envId = Get-EntityId $createEnv.response
}
Add-Check $checks "remote-env-create" ($(if ($createEnv.ok -and -not [string]::IsNullOrWhiteSpace($envId)) { "passed" } else { "failed" })) @{
  env_id = $envId
  location_dbs = $siteALocationDbs
  file_server_host = $SiteAArchivesHost
  error = $createEnv.error
  response = $createEnv.response
}
$envDetectInterval = $null
if (-not [string]::IsNullOrWhiteSpace($envId) -and -not $SkipRelay) {
  $envDetectInterval = Set-EnvDetectInterval $SiteABase $headers $envId $RelayDetectIntervalSec
}

if (-not [string]::IsNullOrWhiteSpace($envId)) {
  $sitePayload = @{
    name = "site-b-local"
    location = $siteBLocation
    http_host = $SiteBHttpHost
    dbnums = $null
    notes = "Created by local remote-collab smoke"
  }
  $createSite = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/envs/$envId/sites") $sitePayload $headers
  if ($createSite.ok) {
    $siteId = Get-EntityId $createSite.response
  }
  Add-Check $checks "remote-site-create" ($(if ($createSite.ok -and -not [string]::IsNullOrWhiteSpace($siteId)) { "passed" } else { "failed" })) @{
    site_id = $siteId
    error = $createSite.error
    response = $createSite.response
  }

  $mqttTest = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/envs/$envId/test-mqtt") @{} $headers
  Add-Check $checks "remote-env-test-mqtt" ($(if ($mqttTest.ok) { "passed" } else { "failed" })) @{ error = $mqttTest.error; response = $mqttTest.response }

  $httpTest = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/envs/$envId/test-http") @{} $headers
  Add-Check $checks "remote-env-test-http" ($(if ($httpTest.ok) { "passed" } else { "failed" })) @{ error = $httpTest.error; response = $httpTest.response }

  if (-not [string]::IsNullOrWhiteSpace($siteId)) {
    $siteHttpTest = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/sites/$siteId/test-http") @{} $headers
    Add-Check $checks "remote-site-test-http" ($(if ($siteHttpTest.ok) { "passed" } else { "failed" })) @{ error = $siteHttpTest.error; response = $siteHttpTest.response }
  }

  $activate = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/envs/$envId/activate") @{} $headers
  Add-Check $checks "remote-env-activate" ($(if ($activate.ok) { "passed" } else { "failed" })) @{ error = $activate.error; response = $activate.response }
} else {
  Add-Check $checks "remote-site-create" "skipped" @{ reason = "env creation failed" }
  Add-Check $checks "remote-env-test-mqtt" "skipped" @{ reason = "env creation failed" }
  Add-Check $checks "remote-env-test-http" "skipped" @{ reason = "env creation failed" }
  Add-Check $checks "remote-site-test-http" "skipped" @{ reason = "env creation failed" }
  Add-Check $checks "remote-env-activate" "skipped" @{ reason = "env creation failed" }
}

$runtime = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/runtime/status") $null $headers
Add-Check $checks "remote-runtime-status" ($(if ($runtime.ok) { "passed" } else { "failed" })) @{ error = $runtime.error; response = $runtime.response }

# LS-20 · 激活确实生效：plant-model-gen 看 runtime/status.active + env_id；plant-web-server 看 envs[].active
$runtimeHasActiveField = $runtime.ok -and ($null -ne (Get-ObjectValue $runtime.response @("active")))
if ([string]::IsNullOrWhiteSpace($envId)) {
  Add-Check $checks "remote-runtime-active-env" "skipped" @{ reason = "env creation failed" }
} elseif (-not $runtime.ok) {
  Add-Check $checks "remote-runtime-active-env" "failed" @{ error = $runtime.error; expected_env_id = $envId }
} elseif ($runtimeHasActiveField) {
  $rtActive = Get-ObjectValue $runtime.response @("active")
  $rtEnvId = [string](Get-ObjectValue $runtime.response @("env_id"))
  Add-Check $checks "remote-runtime-active-env" ($(if ($rtActive -eq $true -and $rtEnvId -eq $envId) { "passed" } else { "failed" })) @{
    backend = "plant-model-gen"
    active = $rtActive
    env_id = $rtEnvId
    expected_env_id = $envId
    mqtt_connected = (Get-ObjectValue $runtime.response @("mqtt_connected"))
  }
} else {
  $envsAfterActivate = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/envs") $null $headers
  $flagged = Get-ActiveEnvIdFromEnvsResponse $envsAfterActivate.response
  Add-Check $checks "remote-runtime-active-env" ($(if ($envsAfterActivate.ok -and $flagged -eq $envId) { "passed" } else { "failed" })) @{
    backend = "plant-web-server (runtime/status has no active field)"
    active_env_id = $flagged
    expected_env_id = $envId
    running = (Get-ObjectValue $runtime.response @("running"))
  }
}

$topology = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/topology") $null $headers
Add-Check $checks "remote-topology" ($(if ($topology.ok) { "passed" } else { "failed" })) @{ error = $topology.error; response = $topology.response }

$subscription = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/mqtt/subscription/status") $null $headers
if ($subscription.ok) {
  $topic = Get-FirstTopic $subscription.response
}
Add-Check $checks "mqtt-subscription-status" ($(if ($subscription.ok) { "passed" } else { "failed" })) @{ topic = $topic; error = $subscription.error; response = $subscription.response }

try {
  $fixture = Write-IncrementalFixture $FixtureDir $FixtureFileName $AppendBytes
  Add-Check $checks "incremental-fixture-append" "passed" $fixture
} catch {
  Add-Check $checks "incremental-fixture-append" "failed" @{ directory = $FixtureDir; file = $FixtureFileName; append_bytes = $AppendBytes; error = $_.Exception.Message }
}

$publishOk = $false
if ($SkipMqttPublish) {
  Add-Check $checks "mqtt-publish-test" "skipped" @{ reason = "SkipMqttPublish was set" }
} else {
  $publisherPath = Find-MosquittoPub $MosquittoDir
  if ($null -eq $publisherPath) {
    Add-Check $checks "mqtt-publish-test" "skipped" @{ reason = "mosquitto_pub not found (PATH / -MosquittoDir / C:\Program Files\mosquitto)"; topic = $topic }
  } else {
    if ([string]::IsNullOrWhiteSpace($topic)) {
      $topic = "Sync/E3d"
    }
    # 字段与 plant-model-gen mqtt_service::SyncE3dFileMsg 一致；location 必须 != Site A 的 location 才会被处理。
    # 坏包（字段缺失 / 类型不对）自 2026-09-15 起只记 warn 跳过，不再 panic 掉订阅任务；这条 fixture 不是
    # Site A 索引里的 db 文件，A 会在 e3d_sync_ledger 落一行 inbound/skipped（unknown_local_file），不 clone。
    $message = @{
      file_names = @($(if ($null -ne $fixture) { $fixture.file_name } else { $FixtureFileName }))
      file_hashes = @($(if ($null -ne $fixture) { $fixture.sha256 } else { "" }))
      file_server_host = $SiteBArchivesHost
      location = $siteBLocation
      timestamp = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress -Depth 8
    try {
      & $publisherPath -h $MqttHost -p $MqttPort -t $topic -m $message
      if ($LASTEXITCODE -ne 0) { throw "mosquitto_pub exit code $LASTEXITCODE" }
      $publishOk = $true
      Add-Check $checks "mqtt-publish-test" "passed" @{ topic = $topic; message = $message; publisher = $publisherPath }
    } catch {
      Add-Check $checks "mqtt-publish-test" "failed" @{ topic = $topic; error = $_.Exception.Message; publisher = $publisherPath }
    }
  }
}

# LS-21 · Site A 的 MQTT 订阅确实收到了这条消息：plant-model-gen 收到 Publish 后把 MQTT_CONNECT_STATUS 置 true，
# 通过 runtime/status.mqtt_connected 可观察（订阅在 activate 时随 watcher 一起启动，需 web_server,mqtt feature）。
if (-not $publishOk) {
  Add-Check $checks "mqtt-received-after-publish" "skipped" @{ reason = "mqtt publish not performed" }
} elseif ([string]::IsNullOrWhiteSpace($envId)) {
  Add-Check $checks "mqtt-received-after-publish" "skipped" @{ reason = "env creation failed (nothing activated)" }
} elseif (-not $runtimeHasActiveField) {
  Add-Check $checks "mqtt-received-after-publish" "skipped" @{ reason = "runtime/status has no mqtt_connected field (plant-web-server semantics)" }
} else {
  $deadline = (Get-Date).AddSeconds($MqttReceiveTimeoutSec)
  $attempts = 0
  $received = $false
  $lastStatus = $null
  do {
    $attempts++
    $probe = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/runtime/status") $null $headers
    if ($probe.ok) {
      $lastStatus = $probe.response
      if ((Get-ObjectValue $probe.response @("mqtt_connected")) -eq $true) { $received = $true; break }
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  Add-Check $checks "mqtt-received-after-publish" ($(if ($received) { "passed" } else { "failed" })) @{
    attempts = $attempts
    timeout_sec = $MqttReceiveTimeoutSec
    mqtt_connected = (Get-ObjectValue $lastStatus @("mqtt_connected"))
    active = (Get-ObjectValue $lastStatus @("active"))
    env_id = (Get-ObjectValue $lastStatus @("env_id"))
    hint = $(if ($received) { $null } else { "订阅未收到消息：确认 web_server 带 mqtt feature 编译、activate 成功、broker 与 env.mqtt_host:mqtt_port 一致；后端日志里若有 panic 多半是消息反序列化失败" })
  }
}

Start-Sleep -Seconds 2
$logs = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/logs?limit=5") $null $headers
Add-Check $checks "remote-sync-logs" ($(if ($logs.ok) { "passed" } else { "failed" })) @{ error = $logs.error; response = $logs.response }

# ---------------------------------------------------------------------------
# LS-23 / LS-24 · 中继链路（SQLite-only 方案 P4）——必须在 LS-22 stop 之前跑，结果压到 LS-22 之后再记，
# 保住 LS-01..22 的编号。
#   1. Site B 也激活一个 env（B 的订阅随 activate 起）；
#   2. 等 A 的中继轮询给 -RelayFileB 对应的库写了基线水位；
#   3. 给 B 的副本追加垃圾字节（之后要看它被 A 的 CBA 还原）；
#   4. 把 A 的水位回退 N 个会话——A 下一轮判定「sesno 前进了」→ e3d-io diff → 广播；
#   5. LS-23：A 台账出现 outbound/ok；LS-24：B 台账出现 inbound/ok 且 sesno_seen == sesno_to，副本 SHA256 == A 的源文件；
#      LS-25：台账读侧 API（pws b61b7ca，/api/remote-sync/ledger/*）对同一 msg_id 读到的与 sqlite3 一致。
# ---------------------------------------------------------------------------
$relayChecks = [System.Collections.Generic.List[object]]::new()
# LS-25 默认 skipped，只有 LS-23 跑到广播成功那一步才真查
$ledgerApiCheck = @{ name = "relay-ledger-api"; status = "skipped"; details = @{ reason = "LS-23 did not reach a broadcast (see LS-23)" } }
$siteBHeaders = @{}
$siteBEnvId = ""
$relayFileName = [System.IO.Path]::GetFileName($RelayFileB)
$sqliteTool = Find-SqliteTool $SqliteExe

function Wait-LedgerRow($Tool, [string]$DbPath, [string]$Direction, [string]$FileName, [string]$SinceIso, [int]$TimeoutSec, [string]$MsgId = "") {
  # 给了 msg_id 就只认这一条：broker 上的 retained 消息会让 B 一订阅就把上一轮的文件再收一遍，
  # 那一行同样是 inbound/ok，不锁定 msg_id 就分不清收到的是不是本轮广播的。
  $msgFilter = $(if ([string]::IsNullOrWhiteSpace($MsgId)) { "" } else { " AND msg_id = $(ConvertTo-SqlLiteral $MsgId)" })
  $sql = "SELECT direction, file_name, verify_status, verify_detail, diff_status, sesno_from, sesno_to, sesno_seen, diff_inserted, diff_deleted, diff_modified, msg_id, created_at, (SELECT COUNT(*) FROM e3d_sync_changes c WHERE c.ledger_id = l.id) AS changes FROM e3d_sync_ledger l WHERE direction = $(ConvertTo-SqlLiteral $Direction) AND file_name = $(ConvertTo-SqlLiteral $FileName) AND created_at > $(ConvertTo-SqlLiteral $SinceIso)$msgFilter ORDER BY created_at DESC LIMIT 5"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $attempts = 0
  $rows = @()
  do {
    $attempts++
    try { $rows = @(Invoke-SqliteQuery $Tool $DbPath $sql) } catch { $rows = @() }
    $ok = @($rows | Where-Object { $_.verify_status -eq "ok" })
    if ($ok.Count -gt 0) { return [pscustomobject]@{ found = $true; row = $ok[0]; rows = $rows; attempts = $attempts } }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  return [pscustomobject]@{ found = $false; row = $null; rows = $rows; attempts = $attempts }
}

if ($SkipRelay) {
  $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = "skipped"; details = @{ reason = "SkipRelay was set" } }) | Out-Null
  $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = "SkipRelay was set" } }) | Out-Null
} elseif ([string]::IsNullOrWhiteSpace($envId) -or -not $runtimeHasActiveField) {
  $reason = $(if ([string]::IsNullOrWhiteSpace($envId)) { "env creation failed (Site A not activated)" } else { "runtime/status has no active field (plant-web-server semantics; relay needs plant-model-gen)" })
  $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = "skipped"; details = @{ reason = $reason } }) | Out-Null
  $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = $reason } }) | Out-Null
} elseif ($null -eq $sqliteTool) {
  $reason = "neither sqlite3.exe nor python found (use -SqliteExe); LS-23/24 read both sites' SQLite ledgers"
  $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = "skipped"; details = @{ reason = $reason } }) | Out-Null
  $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = $reason } }) | Out-Null
} elseif (-not (Test-Path $SiteASqlite)) {
  $reason = "Site A sqlite not found: $SiteASqlite (pass -SiteASqlite)"
  $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = "skipped"; details = @{ reason = $reason } }) | Out-Null
  $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = $reason } }) | Out-Null
} else {
  $outDetails = [ordered]@{ tool = $sqliteTool.kind; site_a_sqlite = $SiteASqlite; file_name = $relayFileName; rewind_sessions = $RelayRewindSessions; detect_interval_sec = $RelayDetectIntervalSec }
  $outDetails.site_a_env_config = @{ ok = $envDetectInterval.ok; error = $envDetectInterval.error }

  # 1. Site B：登录 → 建 env（file_server_host = B 自己的 CBA 目录）→ detect_interval → activate
  $siteB = [ordered]@{}
  $loginB = Invoke-SmokeJson "POST" (Join-Url $SiteBBase "/api/admin/auth/login") @{ username = $AdminUser; password = $AdminPass } @{}
  if ($loginB.ok) {
    $tokenB = Get-TokenFromLoginResponse $loginB.response
    if (-not [string]::IsNullOrWhiteSpace($tokenB)) { $siteBHeaders = @{ Authorization = "Bearer $tokenB" } }
  }
  $siteB.login = @{ ok = ($loginB.ok -and $siteBHeaders.ContainsKey("Authorization")); error = $loginB.error }
  if ($siteB.login.ok) {
    $siteBLocationDbs = Get-RuntimeLocationDbs $SiteBBase $siteBHeaders
    $envB = Invoke-SmokeJson "POST" (Join-Url $SiteBBase "/api/remote-sync/envs") @{
      name = "local-dual-site-b-" + (Get-Date -Format "yyyyMMdd-HHmmss")
      mqtt_host = $MqttHost
      mqtt_port = $MqttPort
      file_server_host = $SiteBArchivesHost
      location = $siteBLocation
      location_dbs = $siteBLocationDbs
    } $siteBHeaders
    if ($envB.ok) { $siteBEnvId = Get-EntityId $envB.response }
    $siteB.env = @{ ok = ($envB.ok -and -not [string]::IsNullOrWhiteSpace($siteBEnvId)); id = $siteBEnvId; location_dbs = $siteBLocationDbs; error = $envB.error }
    if (-not [string]::IsNullOrWhiteSpace($siteBEnvId)) {
      $cfgB = Set-EnvDetectInterval $SiteBBase $siteBHeaders $siteBEnvId $RelayDetectIntervalSec
      $siteB.env_config = @{ ok = $cfgB.ok; error = $cfgB.error }
      $activateB = Invoke-SmokeJson "POST" (Join-Url $SiteBBase "/api/remote-sync/envs/$siteBEnvId/activate") @{} $siteBHeaders
      $statusB = Invoke-SmokeJson "GET" (Join-Url $SiteBBase "/api/remote-sync/runtime/status") $null $siteBHeaders
      $siteB.activate = @{ ok = $activateB.ok; response = $activateB.response; error = $activateB.error }
      $siteB.runtime = @{ active = (Get-ObjectValue $statusB.response @("active")); relay = (Get-ObjectValue $statusB.response @("relay")); env_id = (Get-ObjectValue $statusB.response @("env_id")) }
    }
  }
  $outDetails.site_b = $siteB
  # activate 的成功标志两种后端不一样：plant-model-gen 给 status: "success"，
  # plant-web-server 给 success: true（它的 status 在 item 里，是 env 的状态不是调用结果）。
  $siteBActivateOk = ((Get-ObjectValue $siteB.activate.response @("status")) -eq "success") -or
                     ((Get-ObjectValue $siteB.activate.response @("success")) -eq $true)
  $siteBActive = ($null -ne $siteB.runtime -and $siteB.runtime.active -eq $true -and $siteBActivateOk)

  # 2. 等 A 的中继轮询给这个库写基线（首轮 db_index 扫描 + 基线，工程小的话几秒）
  $wmSql = "SELECT dbnum, file_name, sesno, last_seen_fingerprint FROM relay_sync_watermark WHERE file_name = $(ConvertTo-SqlLiteral $relayFileName)"
  $deadline = (Get-Date).AddSeconds($RelayTimeoutSec)
  $baseline = $null
  do {
    try { $baseline = @(Invoke-SqliteQuery $sqliteTool $SiteASqlite $wmSql) | Select-Object -First 1 } catch { $baseline = $null }
    if ($null -ne $baseline) { break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  $outDetails.baseline = $baseline

  if ($null -eq $baseline) {
    $outDetails.hint = "Site A 的 relay_sync_watermark 里没有 $relayFileName：确认 A 是中继模式（runtime/status.relay == true）、该库在 A 的 included_projects / location_dbs 内、-RelayFileB 文件名与 A 的 db_index file_name 一致"
    $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = "failed"; details = $outDetails }) | Out-Null
    $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = "LS-23 did not pass" } }) | Out-Null
  } else {
    # 3. 弄脏 B 的副本（有的话）：追加随机字节，clone 后应被还原成 A 的源文件
    $copyB = [ordered]@{ path = $RelayFileB; exists = (Test-Path $RelayFileB) }
    if ($copyB.exists) {
      $copyB.length_before = (Get-Item $RelayFileB).Length
      $copyB.sha256_before = Get-FileSha256 $RelayFileB
      try {
        $dirty = Write-IncrementalFixture (Split-Path -Parent $RelayFileB) $relayFileName $AppendBytes
        $copyB.dirtied = @{ appended_bytes = $dirty.appended_bytes; length = $dirty.length; sha256 = $dirty.sha256 }
      } catch {
        $copyB.dirtied = @{ error = $_.Exception.Message }
      }
    }
    $outDetails.site_b_copy = $copyB

    # 4. 回退 A 的水位（指纹不动，免去一拍去抖）
    $sinceIso = (Get-Date).ToUniversalTime().AddSeconds(-1).ToString("yyyy-MM-ddTHH:mm:ss")
    $rewindSql = "UPDATE relay_sync_watermark SET sesno = CASE WHEN sesno > $RelayRewindSessions THEN sesno - $RelayRewindSessions ELSE 0 END, updated_at = $(ConvertTo-SqlLiteral $sinceIso) WHERE file_name = $(ConvertTo-SqlLiteral $relayFileName); SELECT dbnum, sesno FROM relay_sync_watermark WHERE file_name = $(ConvertTo-SqlLiteral $relayFileName)"
    try {
      $after = @(Invoke-SqliteQuery $sqliteTool $SiteASqlite $rewindSql) | Select-Object -First 1
      $outDetails.rewind = @{ ok = $true; sesno_before = $baseline.sesno; sesno_after = $after.sesno; at = $sinceIso }
    } catch {
      $outDetails.rewind = @{ ok = $false; error = $_.Exception.Message }
    }

    if (-not $outDetails.rewind.ok) {
      $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = "failed"; details = $outDetails }) | Out-Null
      $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = "LS-23 did not pass" } }) | Out-Null
    } else {
      # 5a. LS-23：A 台账 outbound/ok
      $outWait = Wait-LedgerRow $sqliteTool $SiteASqlite "outbound" $relayFileName $sinceIso $RelayTimeoutSec
      $outDetails.attempts = $outWait.attempts
      $outDetails.ledger = $outWait.row
      if (-not $outWait.found) {
        $outDetails.recent_rows = $outWait.rows
        $outDetails.hint = "A 没有在 $RelayTimeoutSec s 内广播：看 A 日志里 relay-sync 行（open_failed / sesno_disagree / publish_failed 会落台账，见 recent_rows）；detect_interval 是否生效"
      }
      $relayChecks.Add(@{ name = "relay-outbound-ledger"; status = $(if ($outWait.found) { "passed" } else { "failed" }); details = $outDetails }) | Out-Null

      # 5c. LS-25：台账读侧 API 与 sqlite3 一致（A 的 outbound 行 + 它的清单 total；B 的 inbound 行在 LS-24 之后补查）
      if ($outWait.found) {
        $ledgerMsgId = [string]$outWait.row.msg_id
        $apiDetails = [ordered]@{ msg_id = $ledgerMsgId; sqlite_changes = $outWait.row.changes }
        $ledgerA = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/ledger?direction=outbound&msg_id=$ledgerMsgId") $null $headers
        if (-not $ledgerA.ok -and $ledgerA.error -match "404") {
          $ledgerApiCheck = @{ name = "relay-ledger-api"; status = "skipped"; details = @{ reason = "Site A has no /api/remote-sync/ledger (plant-web-server < b61b7ca, or plant-model-gen)"; error = $ledgerA.error } }
        } else {
          $rowA = @(Get-ObjectValue $ledgerA.response @("items")) | Select-Object -First 1
          $totalA = Get-ObjectValue $ledgerA.response @("total")
          $apiDetails.site_a = [ordered]@{ ok = $ledgerA.ok; total = $totalA; id = $rowA.id; verify_status = $rowA.verify_status; changes_count = $rowA.changes_count; sesno_to = $rowA.sesno_to; error = $ledgerA.error }
          $aOk = $ledgerA.ok -and ([string]$totalA -eq "1") -and ($rowA.verify_status -eq "ok") -and ([string]$rowA.changes_count -eq [string]$outWait.row.changes) -and ([string]$rowA.sesno_to -eq [string]$outWait.row.sesno_to)
          $changesOk = $false
          if (-not [string]::IsNullOrWhiteSpace([string]$rowA.id)) {
            $changesA = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/ledger/rows/$($rowA.id)/changes?limit=1") $null $headers
            $changesTotal = Get-ObjectValue $changesA.response @("total")
            $changesItems = @(Get-ObjectValue $changesA.response @("items"))
            $apiDetails.site_a_changes = [ordered]@{ ok = $changesA.ok; total = $changesTotal; first_refno = $changesItems[0].refno; error = $changesA.error }
            $changesOk = $changesA.ok -and ([string]$changesTotal -eq [string]$outWait.row.changes) -and (([int]$outWait.row.changes -eq 0) -or ($changesItems.Count -eq 1))
          }
          $apiDetails.site_a_ok = $aOk
          $apiDetails.site_a_changes_ok = $changesOk
          $ledgerApiCheck = @{ name = "relay-ledger-api"; status = $(if ($aOk -and $changesOk) { "passed" } else { "failed" }); details = $apiDetails }
          if (-not ($aOk -and $changesOk)) {
            $apiDetails.hint = "A 的 GET ledger?direction=outbound&msg_id=… 应恰 1 行 ok 且 changes_count / rows/{id}/changes.total 都等于 sqlite3 数出的 e3d_sync_changes 行数（$($outWait.row.changes)）"
          }
        }
      }

      # 5b. LS-24：B 台账 inbound/ok 且 sesno_seen == sesno_to；副本被还原
      if (-not $outWait.found) {
        $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = "LS-23 did not pass" } }) | Out-Null
      } elseif (-not $siteBActive) {
        $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "failed"; details = @{ reason = "Site B runtime not active (see LS-23 details.site_b)"; site_b = $siteB } }) | Out-Null
      } elseif (-not (Test-Path $SiteBSqlite)) {
        $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = "skipped"; details = @{ reason = "Site B sqlite not found: $SiteBSqlite (pass -SiteBSqlite)" } }) | Out-Null
      } else {
        $expectedMsgId = [string]$outWait.row.msg_id
        $inDetails = [ordered]@{ site_b_sqlite = $SiteBSqlite; file_name = $relayFileName; expected_sesno_to = $outWait.row.sesno_to; expected_msg_id = $expectedMsgId }
        $inWait = Wait-LedgerRow $sqliteTool $SiteBSqlite "inbound" $relayFileName $sinceIso $RelayTimeoutSec $expectedMsgId
        $inDetails.attempts = $inWait.attempts
        $inDetails.ledger = $inWait.row
        $sesnoMatches = $false
        if ($inWait.found) {
          $sesnoMatches = ($null -ne $inWait.row.sesno_seen) -and ([string]$inWait.row.sesno_seen -eq [string]$inWait.row.sesno_to) -and ([string]$inWait.row.sesno_to -eq [string]$outWait.row.sesno_to)
        }
        $inDetails.sesno_seen_equals_sesno_to = $sesnoMatches
        if ($copyB.exists) {
          $restored = [ordered]@{ length_after = (Get-Item $RelayFileB).Length; sha256_after = Get-FileSha256 $RelayFileB }
          $restored.length_restored = ($restored.length_after -eq $copyB.length_before)
          if (Test-Path $RelayFileA) {
            $restored.sha256_source_a = Get-FileSha256 $RelayFileA
            $restored.matches_site_a = ($restored.sha256_after -eq $restored.sha256_source_a)
          }
          $inDetails.site_b_copy = $restored
        }
        $copyOk = (-not $copyB.exists) -or ($null -eq $inDetails.site_b_copy.matches_site_a) -or ($inDetails.site_b_copy.matches_site_a -eq $true)
        # clone 没发生（或没还原）时把副本截回原长度：追加的垃圾在文件尾，截掉就是原文件，别让下次 smoke 越叠越脏
        if ($copyB.exists -and $null -ne $copyB.length_before -and -not $inDetails.site_b_copy.length_restored) {
          try {
            $fs = Invoke-WithFileRetry { param($p) [System.IO.File]::Open($p, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read) } $RelayFileB
            try { $fs.SetLength([long]$copyB.length_before) } finally { $fs.Dispose() }
            $inDetails.site_b_copy.truncated_back_by_smoke = ((Get-FileSha256 $RelayFileB) -eq $copyB.sha256_before)
          } catch {
            $inDetails.site_b_copy.truncated_back_by_smoke = "failed: " + $_.Exception.Message
          }
        }
        if (-not $inWait.found) {
          # 锁了 msg_id 时 $inWait.rows 必然是空的，诊断要看同窗口内 B 收到的所有行
          try { $inDetails.recent_rows = (Wait-LedgerRow $sqliteTool $SiteBSqlite "inbound" $relayFileName $sinceIso 0).rows } catch { $inDetails.recent_rows = $inWait.rows }
          $inDetails.hint = "B 没有 msg_id = $expectedMsgId 的 inbound/ok：recent_rows 里若是 clone_failed → 看 A 的 env.file_server_host（$SiteAArchivesHost）能否 GET 到 $relayFileName.cba；hash_mismatch / sesno_mismatch → 两站读的不是同一份源；没有任何行 → B 没订到（broker / B 的 activate）"
        } elseif (-not $copyOk) {
          $inDetails.hint = "B 台账 ok 但副本与 A 源文件 SHA256 不一致：clone 写的不是 -RelayFileB 这个路径？"
        }
        $relayChecks.Add(@{ name = "relay-inbound-ledger"; status = $(if ($inWait.found -and $sesnoMatches -and $copyOk) { "passed" } else { "failed" }); details = $inDetails }) | Out-Null

        # 5c'. LS-25 的 B 侧：同一 msg_id 在 B 的读侧 API 上恰 1 行 inbound/ok（LS-24 过了才有意义；B 没这组端点就只记录）
        if ($inWait.found -and $ledgerApiCheck.status -ne "skipped") {
          $ledgerB = Invoke-SmokeJson "GET" (Join-Url $SiteBBase "/api/remote-sync/ledger?direction=inbound&msg_id=$expectedMsgId") $null $siteBHeaders
          $rowB = @(Get-ObjectValue $ledgerB.response @("items")) | Select-Object -First 1
          $totalB = Get-ObjectValue $ledgerB.response @("total")
          $ledgerApiCheck.details.site_b = [ordered]@{ ok = $ledgerB.ok; total = $totalB; verify_status = $rowB.verify_status; sesno_seen = $rowB.sesno_seen; sesno_to = $rowB.sesno_to; error = $ledgerB.error }
          $bOk = $ledgerB.ok -and ([string]$totalB -eq "1") -and ($rowB.verify_status -eq "ok") -and ([string]$rowB.sesno_seen -eq [string]$inWait.row.sesno_to)
          $ledgerApiCheck.details.site_b_ok = $bOk
          if (-not $bOk) {
            $ledgerApiCheck.status = "failed"
            $ledgerApiCheck.details.hint_b = "B 的 GET ledger?direction=inbound&msg_id=… 应恰 1 行 ok 且 sesno_seen == LS-24 那行的 sesno_to"
          }
        }
      }
    }
  }
}
$relayChecks.Add($ledgerApiCheck) | Out-Null

# LS-22 + 收尾：停止运行时（应清掉 active），删掉 smoke 建的站点 / env；-KeepEnv 时全部跳过
$cleanup = [ordered]@{ performed = (-not $KeepEnv) }
if ($KeepEnv) {
  Add-Check $checks "runtime-stop-clears-active" "skipped" @{ reason = "KeepEnv was set" }
} elseif ([string]::IsNullOrWhiteSpace($envId)) {
  Add-Check $checks "runtime-stop-clears-active" "skipped" @{ reason = "env creation failed (nothing activated)" }
} else {
  $stop = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/runtime/stop") @{} $headers
  $cleanup.stop = @{ ok = $stop.ok; error = $stop.error; response = $stop.response }
  $afterStop = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/runtime/status") $null $headers
  if (-not $stop.ok -or -not $afterStop.ok) {
    Add-Check $checks "runtime-stop-clears-active" "failed" @{ stop_error = $stop.error; status_error = $afterStop.error }
  } elseif ($null -eq (Get-ObjectValue $afterStop.response @("active"))) {
    Add-Check $checks "runtime-stop-clears-active" "skipped" @{ reason = "runtime/status has no active field (plant-web-server: stop only marks tasks Stopped)"; response = $afterStop.response }
  } else {
    $activeAfterStop = Get-ObjectValue $afterStop.response @("active")
    Add-Check $checks "runtime-stop-clears-active" ($(if ($activeAfterStop -eq $false) { "passed" } else { "failed" })) @{
      active = $activeAfterStop
      env_id = (Get-ObjectValue $afterStop.response @("env_id"))
      stop_response = $stop.response
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($siteId)) {
    $delSite = Invoke-SmokeJson "DELETE" (Join-Url $SiteABase "/api/remote-sync/sites/$siteId") $null $headers
    $cleanup.delete_site = @{ id = $siteId; ok = $delSite.ok; error = $delSite.error }
  }
  $delEnv = Invoke-SmokeJson "DELETE" (Join-Url $SiteABase "/api/remote-sync/envs/$envId") $null $headers
  $cleanup.delete_env = @{ id = $envId; ok = $delEnv.ok; error = $delEnv.error }
}

# LS-23 / LS-24 压在 LS-22 之后记（结果在 stop 之前已经算好）
foreach ($relayCheck in $relayChecks) {
  Add-Check $checks $relayCheck.name $relayCheck.status $relayCheck.details
}

# Site B 收尾：LS-23 给 B 激活的 env 也停掉、删掉（-KeepEnv 时保留）
if (-not $KeepEnv -and -not [string]::IsNullOrWhiteSpace($siteBEnvId)) {
  $stopB = Invoke-SmokeJson "POST" (Join-Url $SiteBBase "/api/remote-sync/runtime/stop") @{} $siteBHeaders
  $delEnvB = Invoke-SmokeJson "DELETE" (Join-Url $SiteBBase "/api/remote-sync/envs/$siteBEnvId") $null $siteBHeaders
  $cleanup.site_b = @{ stop = @{ ok = $stopB.ok; error = $stopB.error }; delete_env = @{ id = $siteBEnvId; ok = $delEnvB.ok; error = $delEnvB.error } }
}

$failed = @($checks | Where-Object { $_.status -eq "failed" })
$passed = @($checks | Where-Object { $_.status -eq "passed" })
$skipped = @($checks | Where-Object { $_.status -eq "skipped" })
$report = [pscustomobject]@{
  passed = ($failed.Count -eq 0)
  summary = [pscustomobject]@{
    passed = $passed.Count
    failed = $failed.Count
    skipped = $skipped.Count
  }
  endpoints = [pscustomobject]@{
    site_a_base = $SiteABase
    site_b_base = $SiteBBase
    site_a_archives_host = $SiteAArchivesHost
    site_b_archives_host = $SiteBArchivesHost
    site_b_http_host = $SiteBHttpHost
    mqtt_host = $MqttHost
    mqtt_port = $MqttPort
  }
  ids = [pscustomobject]@{
    env_id = $envId
    site_id = $siteId
    site_b_env_id = $siteBEnvId
    topic = $topic
  }
  relay = [pscustomobject]@{
    site_a_sqlite = $SiteASqlite
    site_b_sqlite = $SiteBSqlite
    file_a = $RelayFileA
    file_b = $RelayFileB
    rewind_sessions = $RelayRewindSessions
    detect_interval_sec = $RelayDetectIntervalSec
    timeout_sec = $RelayTimeoutSec
  }
  fixture = $fixture
  cleanup = $cleanup
  checks = $checks
  started_at = $startedAt
  finished_at = (Get-Date).ToUniversalTime().ToString("o")
}

$reportDir = Split-Path -Parent $ReportPath
if (-not [string]::IsNullOrWhiteSpace($reportDir)) {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
}
$report | ConvertTo-Json -Depth 24 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Output "Local remote-collab smoke finished."
$index = 0
foreach ($check in $checks) {
  $index++
  $note = ""
  if ($check.status -ne "passed" -and $null -ne $check.details) {
    $reason = Get-ObjectValue $check.details @("reason", "error", "hint")
    if ($null -ne $reason) { $note = " - " + [string]$reason }
  }
  Write-Output ("  LS-{0:D2} {1,-7} {2}{3}" -f $index, $check.status, $check.name, $note)
}
Write-Output ("  passed : {0}" -f $passed.Count)
Write-Output ("  failed : {0}" -f $failed.Count)
Write-Output ("  skipped: {0}" -f $skipped.Count)
Write-Output ("  report : {0}" -f $ReportPath)

if ($failed.Count -gt 0) {
  exit 1
}
exit 0

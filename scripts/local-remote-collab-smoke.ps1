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
  [switch]$FixtureOnly,
  [switch]$SkipMqttPublish,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Output "Local remote-collab smoke test"
  Write-Output ""
  Write-Output "Prerequisites:"
  Write-Output "  - Site A web_server is running, default http://127.0.0.1:4100"
  Write-Output "  - Site B web_server is running, default http://127.0.0.1:4101"
  Write-Output "  - MQTT broker is running, default 127.0.0.1:1883"
  Write-Output "  - Site A/B use isolated DbOption.toml, deployment_sites_sqlite_path, location, and DB runtime"
  Write-Output ""
  Write-Output "Usage:"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -SiteABase http://127.0.0.1:4100 -SiteBBase http://127.0.0.1:4101"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts/local-remote-collab-smoke.ps1 -FixtureOnly -FixtureDir `$env:TEMP\remote-collab-fixture"
  Write-Output ""
  Write-Output "Environment overrides:"
  Write-Output "  SITE_A_BASE, SITE_B_BASE, MQTT_HOST, MQTT_PORT, ADMIN_USER, ADMIN_PASS, SMOKE_JSON_REPORT"
  Write-Output "  SMOKE_FIXTURE_DIR, SMOKE_FIXTURE_FILE, SMOKE_APPEND_BYTES"
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

  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
  try {
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $stream.Dispose()
  }

  $item = Get-Item $path
  $hash = Get-FileHash -Algorithm SHA256 -Path $path
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

$envName = "local-dual-site-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$envPayload = @{
  name = $envName
  mqtt_host = $MqttHost
  mqtt_port = $MqttPort
  file_server_host = $SiteBBase
  location = $siteALocation
  location_dbs = $null
}
$createEnv = Invoke-SmokeJson "POST" (Join-Url $SiteABase "/api/remote-sync/envs") $envPayload $headers
if ($createEnv.ok) {
  $envId = Get-EntityId $createEnv.response
}
Add-Check $checks "remote-env-create" ($(if ($createEnv.ok -and -not [string]::IsNullOrWhiteSpace($envId)) { "passed" } else { "failed" })) @{
  env_id = $envId
  error = $createEnv.error
  response = $createEnv.response
}

if (-not [string]::IsNullOrWhiteSpace($envId)) {
  $sitePayload = @{
    name = "site-b-local"
    location = $siteBLocation
    http_host = $SiteBBase
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

if ($SkipMqttPublish) {
  Add-Check $checks "mqtt-publish-test" "skipped" @{ reason = "SkipMqttPublish was set" }
} else {
  $publisher = Get-Command "mosquitto_pub" -ErrorAction SilentlyContinue
  if ($null -eq $publisher) {
    Add-Check $checks "mqtt-publish-test" "skipped" @{ reason = "mosquitto_pub not found on PATH"; topic = $topic }
  } else {
    if ([string]::IsNullOrWhiteSpace($topic)) {
      $topic = "Sync/E3d"
    }
    $message = @{
      file_names = @($(if ($null -ne $fixture) { $fixture.file_name } else { $FixtureFileName }))
      file_hashes = @($(if ($null -ne $fixture) { $fixture.sha256 } else { "" }))
      file_server_host = $SiteBBase
      location = $siteBLocation
      timestamp = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress -Depth 8
    try {
      & $publisher.Source -h $MqttHost -p $MqttPort -t $topic -m $message
      Add-Check $checks "mqtt-publish-test" "passed" @{ topic = $topic; message = $message }
    } catch {
      Add-Check $checks "mqtt-publish-test" "failed" @{ topic = $topic; error = $_.Exception.Message }
    }
  }
}

Start-Sleep -Seconds 2
$logs = Invoke-SmokeJson "GET" (Join-Url $SiteABase "/api/remote-sync/logs?limit=5") $null $headers
Add-Check $checks "remote-sync-logs" ($(if ($logs.ok) { "passed" } else { "failed" })) @{ error = $logs.error; response = $logs.response }

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
    mqtt_host = $MqttHost
    mqtt_port = $MqttPort
  }
  ids = [pscustomobject]@{
    env_id = $envId
    site_id = $siteId
    topic = $topic
  }
  fixture = $fixture
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
Write-Output ("  passed : {0}" -f $passed.Count)
Write-Output ("  failed : {0}" -f $failed.Count)
Write-Output ("  skipped: {0}" -f $skipped.Count)
Write-Output ("  report : {0}" -f $ReportPath)

if ($failed.Count -gt 0) {
  exit 1
}
exit 0

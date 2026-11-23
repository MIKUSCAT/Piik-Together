param([string]$SettingsPath = (Join-Path $PSScriptRoot 'Settings.json'))
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Read-Settings.ps1')
$settings = Read-PiikSettings $SettingsPath
$uri = [Uri]$settings.serverUrl
if (-not $uri.IsDefaultPort) { throw 'The included HTTPS deployment uses port 443.' }
$ip = $null
if (-not [Net.IPAddress]::TryParse($settings.publicIp, [ref]$ip) -or
    $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $settings.publicIp -eq '203.0.113.10') {
    throw 'publicIp must be your server public IPv4 address.'
}
if ($settings.sitePassword -match "[\r\n']") { throw 'Use a password without newlines or single quotes.' }
$server = Join-Path $PSScriptRoot 'Server'
$relay = if ($settings.relayOnly) { 'true' } else { 'false' }
$envText = @(
    "PIIK_DOMAIN=$($uri.Host)"
    "SITE_ACCESS_PASSWORD='$($settings.sitePassword)'"
    "SFU_PUBLIC_IP=$($settings.publicIp)"
    "SFU_ONLY=$relay"
) -join "`n"
Write-PiikText (Join-Path $server '.env') ($envText + "`n")
$output = Join-Path $PSScriptRoot 'Output'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$zip = Join-Path $output ('Piik-Server-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
Write-PiikZip -Directory $server -Path $zip
Write-Host "Server package: $zip"
Write-Host 'Upload and extract this ZIP on your server, then run: docker compose pull && docker compose up -d'

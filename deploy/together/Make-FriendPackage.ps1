param(
    [string]$SettingsPath = (Join-Path $PSScriptRoot 'Settings.json'),
    [switch]$NewRoom
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Read-Settings.ps1')
$settings = Read-PiikSettings $SettingsPath
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = $settings.serverUrl
$headers = @{ Origin = $base; Accept = 'application/json' }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = @{ password = $settings.sitePassword } | ConvertTo-Json -Compress
$access = Invoke-RestMethod -Uri "$base/api/site-access" -Method Post -Headers $headers -WebSession $session `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($login)) -TimeoutSec 30
if (-not $access.required -or -not $access.authenticated) {
    throw 'Set SITE_ACCESS_PASSWORD on the server before creating the private package.'
}
$capabilities = Invoke-RestMethod -Uri "$base/api/capabilities" -WebSession $session -TimeoutSec 30
if (-not $capabilities.hostRoomSession) { throw 'Deploy the included Piik Together server package first.' }
$roomFile = Join-Path $PSScriptRoot 'owner-room.local.json'
$room = $null
if (-not $NewRoom -and (Test-Path -LiteralPath $roomFile)) {
    $saved = Get-Content -LiteralPath $roomFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($saved.site -eq $base) {
        $room = $saved.room
        $roomHeaders = @{ Origin = $base; Authorization = "Bearer $($room.hostToken)" }
        try {
            $null = Invoke-RestMethod -Uri "$base/api/rooms/$($room.roomId)/access" -Method Post `
                -Headers $roomHeaders -WebSession $session -ContentType 'application/json' `
                -Body '{"action":"set-code-entry-policy","policy":"private"}' -TimeoutSec 30
        } catch {
            throw 'The saved room is unavailable. Check the server, or run Make-FriendPackage.ps1 -NewRoom to create a new room.'
        }
    }
}
if ($null -eq $room) {
    $created = Invoke-RestMethod -Uri "$base/api/rooms" -Method Post -Headers $headers -WebSession $session `
        -ContentType 'application/json' -Body '{"codeEntryPolicy":"private"}' -TimeoutSec 30
    $room = @{ roomId = $created.roomId; hostToken = $created.hostToken; inviteUrl = $created.inviteUrl }
    Write-PiikText $roomFile (@{ site = $base; room = $room } | ConvertTo-Json -Depth 6)
}
$quality = switch ($settings.quality) {
    '720p30'  { @{ resolution = @{ width = 1280; height = 720 }; maxFramerate = 30; maxBitrate = 3000000 } }
    '1080p30' { @{ resolution = @{ width = 1920; height = 1080 }; maxFramerate = 30; maxBitrate = 5000000 } }
    '1080p60' { @{ resolution = @{ width = 1920; height = 1080 }; maxFramerate = 60; maxBitrate = 8000000 } }
}
$quality.degradationPreference = 'balanced'
$quality.maxAudioBitrate = 128000
$profile = @{ version = 1; site = $base; password = $settings.sitePassword; room = $room; quality = $quality }
$template = Join-Path $PSScriptRoot 'Client'
if (-not (Test-Path -LiteralPath (Join-Path $template 'Piik Together.exe'))) {
    throw 'Client/Piik Together.exe is missing. Extract the complete owner package.'
}
$output = Join-Path $PSScriptRoot 'Output'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$staging = Join-Path $output ('Piik-Friend-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath $template -Destination $staging -Recurse
Write-PiikText (Join-Path $staging 'piik-profile.json') ($profile | ConvertTo-Json -Depth 6)
$zip = "$staging.zip"
Write-PiikZip -Directory $staging -Path $zip -IncludeDirectory $true
Write-PiikText (Join-Path $output 'Watch.url') ("[InternetShortcut]`r`nURL=$($room.inviteUrl)`r`n")
Write-PiikText (Join-Path $output 'Watch.txt') ($room.inviteUrl + "`r`n")
Write-Host "Ready to send: $zip"
Write-Host "Your viewer link: $(Join-Path $output 'Watch.txt')"

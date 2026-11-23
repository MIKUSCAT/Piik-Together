function Read-PiikSettings {
    param([string]$Path)
    $settings = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    $uri = [Uri]$settings.serverUrl
    if (-not $uri.IsAbsoluteUri -or ($uri.Scheme -ne 'https' -and -not $uri.IsLoopback) -or
        $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) {
        throw 'serverUrl must be an HTTPS origin, such as https://watch.example.com'
    }
    if ($uri.Host -eq 'watch.example.com' -or -not $settings.sitePassword -or $settings.sitePassword -eq 'CHANGE-ME') {
        throw 'Please fill in Settings.json first.'
    }
    $settings.serverUrl = $uri.GetLeftPart([UriPartial]::Authority)
    if ($settings.quality -notin @('720p30', '1080p30', '1080p60')) {
        throw 'quality must be 720p30, 1080p30 or 1080p60.'
    }
    return $settings
}

function Write-PiikText {
    param([string]$Path, [string]$Text)
    [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}

function Write-PiikZip {
    param([string]$Directory, [string]$Path, [bool]$IncludeDirectory = $false)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [AppContext]::SetSwitch('Switch.System.IO.Compression.ZipFile.UseBackslash', $false)
    [IO.Compression.ZipFile]::CreateFromDirectory($Directory, $Path, [IO.Compression.CompressionLevel]::Optimal, $IncludeDirectory)
}

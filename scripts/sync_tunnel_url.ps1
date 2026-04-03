param(
    [string]$Ec2Host = "13.235.18.52",
    [string]$Ec2User = "ubuntu",
    [string]$SshKeyPath = "C:\Users\ritan\Desktop\justVIBE_keypair.pem",
    [switch]$SkipBuild,
    [switch]$SkipPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiFile = Join-Path $repoRoot "src\services\mlApi.js"

if (-not (Test-Path $SshKeyPath)) {
    throw "SSH key not found at: $SshKeyPath"
}

if (-not (Test-Path $apiFile)) {
    throw "API file not found at: $apiFile"
}

Write-Host "[1/6] Fetching current tunnel URL from EC2..."
$remoteCmd = "grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' ~/logs/cloudflared.log | tail -n 1"
$sshOutput = & ssh -o StrictHostKeyChecking=accept-new -i $SshKeyPath "$Ec2User@$Ec2Host" $remoteCmd 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "SSH command failed while fetching tunnel URL: $($sshOutput -join [Environment]::NewLine)"
}

$tunnelUrl = (($sshOutput | Select-Object -Last 1) -as [string])
if ($null -ne $tunnelUrl) {
    $tunnelUrl = $tunnelUrl.Trim()
}

if ([string]::IsNullOrWhiteSpace($tunnelUrl)) {
    throw "Could not read tunnel URL from EC2 logs. Ensure justvibe-tunnel is running."
}

if ($tunnelUrl -notmatch '^https://[-a-zA-Z0-9]+\.trycloudflare\.com$') {
    throw "Invalid tunnel URL format: $tunnelUrl"
}

Write-Host "    Tunnel URL: $tunnelUrl"

Write-Host "[2/6] Updating src/services/mlApi.js..."
$oldContent = Get-Content -Path $apiFile -Raw
$pattern = "(?ms)const API_BASE = import\.meta\.env\.PROD\s*\n\s*\? 'https://[^']+'\s*\n\s*:\s*\(import\.meta\.env\.VITE_API_BASE \|\| 'http://127\.0\.0\.1:6261'\);"
$replacement = "const API_BASE = import.meta.env.PROD`n  ? '$tunnelUrl'`n  : (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:6261');"

if ($oldContent -notmatch $pattern) {
    throw "Could not find API_BASE block to update in mlApi.js"
}

$newContent = [regex]::Replace($oldContent, $pattern, $replacement)

if ($newContent -eq $oldContent) {
    Write-Host "    No code changes needed (already up to date)."
} else {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($apiFile, $newContent, $utf8NoBom)
    Write-Host "    Updated API_BASE to $tunnelUrl"
}

if (-not $SkipBuild) {
    Write-Host "[3/6] Running production build..."
    Push-Location $repoRoot
    try {
        npm run build | Out-Host
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[3/6] Build skipped."
}

Write-Host "[4/6] Preparing git changes..."
Push-Location $repoRoot
try {
    git add src/services/mlApi.js
    git diff --cached --quiet -- src/services/mlApi.js
    $stagedExit = $LASTEXITCODE

    if ($stagedExit -eq 0) {
        Write-Host "    No git changes to commit."
        Write-Host "[5/6] Commit skipped."
        Write-Host "[6/6] Push skipped."
        exit 0
    }

    $commitMessage = "Sync frontend API URL to active EC2 tunnel"
    git commit -m $commitMessage | Out-Host

    if (-not $SkipPush) {
        Write-Host "[6/6] Pushing to origin/main..."
        git push | Out-Host
    } else {
        Write-Host "[6/6] Push skipped."
    }
} finally {
    Pop-Location
}

Write-Host "Done. Frontend API URL is synced to: $tunnelUrl"
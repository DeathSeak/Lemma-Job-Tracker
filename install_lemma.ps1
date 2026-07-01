# Lemma CLI installer bootstrap for Windows.
#
#   .\install_lemma.ps1
#
# Installs uv (if missing), and installs the lemma-terminal CLI tool.
#
# Requires: PowerShell 5.1+ or PowerShell 7+.

$ErrorActionPreference = "Stop"

function Say { param([string]$msg) Write-Host $msg }
function Fail { param([string]$msg) Write-Error "error: $msg"; exit 1 }

# Ensure $HOME\.local\bin is on PATH (where uv places tools on Windows)
$uvBin = Join-Path $env:USERPROFILE ".local\bin"
if ($env:PATH -notlike "*$uvBin*") {
    $env:PATH = "$uvBin;$env:PATH"
}

# Install uv if missing
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Say "Installing uv (https://astral.sh/uv)..."
    $uvInstaller = Join-Path $env:TEMP "uv-installer.ps1"
    (New-Object System.Net.WebClient).DownloadFile("https://astral.sh/uv/install.ps1", $uvInstaller)
    & powershell -ExecutionPolicy Bypass -File $uvInstaller
    Remove-Item $uvInstaller -ErrorAction SilentlyContinue

    # Re-source PATH after uv install
    $env:PATH = "$uvBin;$env:PATH"

    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Fail "uv installed but not on PATH. Open a new PowerShell window and re-run."
    }
}

Say "Installing lemma-terminal (CLI)..."
uv tool install --force lemma-terminal | Out-Null

if (-not (Get-Command lemma -ErrorAction SilentlyContinue)) {
    $uvToolBin = uv tool dir --bin 2>$null
    if ($uvToolBin) { $env:PATH = "$uvToolBin;$env:PATH" }
}

if (-not (Get-Command lemma -ErrorAction SilentlyContinue)) {
    Fail "lemma-terminal installed but not on PATH. Run: uv tool update-shell"
}

Say "Lemma CLI installation successful! You can now run the 'lemma' command."

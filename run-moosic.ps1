$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoRoot
try {
    pnpm dev
    if ($LASTEXITCODE -ne 0) { throw 'Moosic could not start. Run pnpm setup first.' }
} finally {
    Pop-Location
}

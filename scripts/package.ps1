$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$archive = Join-Path $release 'radial-new-tab-edge.zip'
New-Item -ItemType Directory -Force -Path $release | Out-Null
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
Compress-Archive -Path (Join-Path $root 'dist\*') -DestinationPath $archive -CompressionLevel Optimal
Write-Output "Created $archive"

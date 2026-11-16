param(
    [string]$Repository = 'Andival-Sei/radial-new-tab',
    [string]$ExpiresAt
)

$ErrorActionPreference = 'Stop'
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Invalid repository.' }
if ($ExpiresAt -and $ExpiresAt -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Expiry must be YYYY-MM-DD.' }

# Copy the newly renewed key from Partner Center first. Never pass it as a CLI argument.
$edgePublishKey = [string](Get-Clipboard -Raw)
try {
    $edgePublishKey = $edgePublishKey.Trim()
    if ($edgePublishKey.Length -lt 20 -or $edgePublishKey -match '\s' -or $edgePublishKey.Contains('•')) {
        throw 'The clipboard does not contain a complete API key. Copy it from Partner Center.'
    }
    $edgePublishKey | gh secret set EDGE_API_KEY --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw 'Could not update the GitHub Actions secret.' }
    if ($ExpiresAt) {
        gh variable set EDGE_API_KEY_EXPIRES_AT --repo $Repository --body $ExpiresAt
        if ($LASTEXITCODE -ne 0) { throw 'Secret updated, but the expiry variable could not be updated.' }
    }
    Write-Output 'EDGE_API_KEY updated in GitHub Actions. The key was not written to disk or printed.'
}
finally {
    $edgePublishKey = $null
    Set-Clipboard -Value '' -ErrorAction SilentlyContinue
}

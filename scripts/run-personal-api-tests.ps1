param(
    [ValidateSet('both', 'soles', 'member-purchases')]
    [string]$Suite = 'both'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = 'api-delsol-chatbot-dev'
$variables = @('BOT_TEST_SESSION_ID', 'BOT_TEST_MEMBER_DOCUMENT', 'BOT_TEST_PURCHASES_DOCUMENT')
$previous = @{}

function Read-PrivateValue([string]$Prompt) {
    $privateValue = Read-Host $Prompt -AsSecureString
    try {
        $value = [PSCredential]::new('dev', $privateValue).GetNetworkCredential().Password.Trim()
        if ([string]::IsNullOrWhiteSpace($value)) { throw 'PRIVATE_VALUE_REQUIRED' }
        return $value
    } finally {
        $privateValue.Dispose()
    }
}

Push-Location $projectRoot
try {
    # Refuse payload logging before asking for any private input.
    @'
import "dotenv/config";
import config from "./config.js";
process.exit(config.env !== "development" || config.bedrockDebugPayloads || config.piiDebugShowRaw ? 1 : 0);
'@ | & docker exec -i $container node --input-type=module
    if ($LASTEXITCODE -ne 0) { throw 'DEV_REQUIRED_OR_UNSAFE_DEBUG_CONFIGURATION' }
    foreach ($name in $variables) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    $env:BOT_TEST_SESSION_ID = Read-PrivateValue 'SessionId vigente de pruebas DEV'
    if ($Suite -in @('both', 'soles')) {
        $env:BOT_TEST_MEMBER_DOCUMENT = Read-PrivateValue 'Documento del socio con saldo y usos de soles'
    }
    if ($Suite -in @('both', 'member-purchases')) {
        $env:BOT_TEST_PURCHASES_DOCUMENT = Read-PrivateValue 'Documento del socio con compras'
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'logs') | Out-Null
    $failed = $false
    $suites = if ($Suite -eq 'both') { @('soles', 'member-purchases') } else { @($Suite) }
    foreach ($currentSuite in $suites) {
        # Only variable names go into command arguments; values stay in this process.
        & docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_MEMBER_DOCUMENT -e BOT_TEST_PURCHASES_DOCUMENT `
            -e BOT_TEST_SOLES_REFERENCE_DATE -e BOT_TEST_SOLES_FROM -e BOT_TEST_SOLES_TO `
            -e BOT_TEST_SOLES_PAGE_SIZE -e BOT_TEST_SOLES_MAX_PAGES `
            -e BOT_TEST_PURCHASES_FROM -e BOT_TEST_PURCHASES_TO `
            -e BOT_TEST_PURCHASES_PAGE_SIZE -e BOT_TEST_PURCHASES_MAX_PAGES `
            -e "BOT_TEST_SUITE=$currentSuite" -e "BOT_TEST_REPORT=/tmp/chatbot-api-tests-$currentSuite.json" `
            $container node scripts/run-api-tests.mjs
        if ($LASTEXITCODE -ne 0) { $failed = $true }
        & docker cp "${container}:/tmp/chatbot-api-tests-$currentSuite.json" (Join-Path $projectRoot "logs/chatbot-api-tests-$currentSuite.json")
        if ($LASTEXITCODE -ne 0) { $failed = $true }
    }
    if ($failed) { throw 'PERSONAL_SUITE_FAILED_SEE_SANITIZED_REPORTS' }
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    $previous.Clear()
    Pop-Location
}

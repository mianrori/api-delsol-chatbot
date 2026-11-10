param([switch]$Preflight)
# Compatibility alias; credentials remain handled by the existing hidden-input runner.
& (Join-Path $PSScriptRoot 'run-invoice-pdf-diagnostic-dev.ps1') -Preflight:$Preflight

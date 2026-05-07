param(
  [Parameter(Mandatory = $true)]
  [string]$PfxPath,
  [Parameter(Mandatory = $true)]
  [string]$PfxPassword,
  [string]$ExePath = ".\dist\BioID-Agent.exe",
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ExePath)) {
  throw "Executavel nao encontrado em: $ExePath"
}
if (-not (Test-Path $PfxPath)) {
  throw "Certificado PFX nao encontrado em: $PfxPath"
}

$signtool = Get-Command signtool -ErrorAction SilentlyContinue
if (-not $signtool) {
  throw "signtool.exe nao encontrado. Instale Windows SDK."
}

& $signtool.Source sign `
  /f $PfxPath `
  /p $PfxPassword `
  /fd SHA256 `
  /tr $TimestampUrl `
  /td SHA256 `
  $ExePath

Write-Host "Assinatura aplicada com sucesso em: $ExePath"

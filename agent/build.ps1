$ErrorActionPreference = "Stop"

Write-Host "==> Build BioID-Agent.exe"

$pyCmd = Get-Command py -ErrorAction SilentlyContinue
$pythonExe = "$env:LocalAppData\Programs\Python\Python312\python.exe"

if ($pyCmd) {
  $pythonCmd = "py"
  $pythonArgs = @("-3")
}
elseif (Test-Path $pythonExe) {
  $pythonCmd = $pythonExe
  $pythonArgs = @()
}
else {
  throw "Python nao encontrado. Instale Python 3.12+."
}

& $pythonCmd @pythonArgs -m pip install --upgrade pip
& $pythonCmd @pythonArgs -m pip install pyinstaller websockets pynput psycopg2-binary

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

& $pythonCmd @pythonArgs -m PyInstaller --noconfirm --onefile --windowed --name "BioID-Agent" --add-data "bio_agent.py;." "gui_app.py"

Write-Host "Build concluido em: $scriptDir\dist\BioID-Agent.exe"

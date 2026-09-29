# Desinstalador do BrOWSER para Windows. Chamado por "Aplicativos instalados" ou manualmente.
#   -Sim  não pede confirmação (CI)
# Não remove o Antigravity CLI (agy), que é do Google e pode ser usado por outros programas.
param([switch]$Sim)
$ErrorActionPreference = 'Stop'

$destino = Join-Path $env:LOCALAPPDATA 'BrOWSER'
$chaveApp = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BrOWSER'
$ponte = Join-Path $destino 'bridge.exe'

if (-not $Sim) {
  $ok = Read-Host 'Remover o BrOWSER deste computador (ponte, registros nos navegadores e dados locais)? (s/N)'
  if ($ok -notmatch '^[sS]') { Write-Host 'Nada foi alterado.'; exit 1 }
}

# O navegador mantém a ponte aberta enquanto a extensão está ativa: sem fechá-la, o arquivo fica travado.
$emUso = Get-Process -Name bridge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ponte }
if ($emUso) {
  if (-not $Sim) { Read-Host 'A ponte está em uso pelo navegador. Feche o navegador e pressione Enter' | Out-Null }
  Get-Process -Name bridge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ponte } | Stop-Process -Force
}

if (Test-Path $ponte) {
  & $ponte --uninstall
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao remover os registros da ponte.' }
}

Remove-Item -Path $chaveApp -Recurse -Force -ErrorAction SilentlyContinue
# A extensão foi instalada dentro desta pasta, então ela sai junto com o resto.
Remove-Item -Path $destino -Recurse -Force
Write-Host 'BrOWSER removido. Remova também a extensão BrOWSER do navegador (menu de extensões > Remover).'
Write-Host 'O Antigravity CLI (agy), se instalado, continua no computador; para removê-lo use o desinstalador do Google.'

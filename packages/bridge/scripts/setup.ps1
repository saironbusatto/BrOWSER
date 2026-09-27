# Instalador do bRowser para Windows (usuário final).
# Uso: coloque este arquivo ao lado do bridge.exe e rode:  powershell -ExecutionPolicy Bypass -File setup.ps1
# Não pede administrador: tudo vai para o perfil do usuário (%LOCALAPPDATA% e HKCU).
# -SemIA: não pergunta sobre instalar o Gemini (usado no CI).
param([switch]$SemIA)
$ErrorActionPreference = 'Stop'

$origem = Join-Path $PSScriptRoot 'bridge.exe'
if (-not (Test-Path $origem)) { throw "bridge.exe não encontrado ao lado deste script ($origem)." }

$destino = Join-Path $env:LOCALAPPDATA 'bRowser'
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Copy-Item $origem (Join-Path $destino 'bridge.exe') -Force
Write-Host "Ponte copiada para $destino"

# Registra a ponte no Chrome, Brave, Edge e Chromium.
& (Join-Path $destino 'bridge.exe') --install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar a ponte nos navegadores.' }

# IA prioritária (Gemini via Antigravity CLI). O login é feito depois, pelo botão Conectar da extensão.
if (-not $SemIA -and -not (Get-Command agy -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $env:LOCALAPPDATA 'agy\bin\agy.exe'))) {
  $resp = Read-Host 'O Gemini (Antigravity CLI) não está instalado. Instalar agora pelo instalador oficial do Google? (s/N)'
  if ($resp -match '^[sS]') {
    Invoke-RestMethod https://antigravity.google/cli/install.ps1 | Invoke-Expression
  } else {
    Write-Host 'Pulando. Você pode usar ChatGPT (codex) ou Claude se já estiverem instalados.'
  }
}

Write-Host ''
Write-Host 'Pronto. Feche e abra o navegador, abra o bRowser e conecte sua assinatura em Assinaturas > Conectar.'

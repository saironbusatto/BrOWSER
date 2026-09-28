# Instalador do BrOWSER para Windows (usuário final).
# Uso: deixe este arquivo ao lado de bridge.exe, uninstall.ps1 e icone.ico e rode:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# Não pede administrador: tudo vai para o perfil do usuário (%LOCALAPPDATA% e HKCU).
#   -Sim    não pede confirmação (CI)
#   -SemIA  não oferece instalar o Gemini (CI)
param([switch]$Sim, [switch]$SemIA, [string]$Versao = '0.1.0')
$ErrorActionPreference = 'Stop'

$destino = Join-Path $env:LOCALAPPDATA 'BrOWSER'
$chaveApp = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BrOWSER'
$privacidade = 'https://github.com/saironbusatto/BrOWSER/blob/main/docs/termos-e-privacidade.md'

foreach ($f in 'bridge.exe', 'uninstall.ps1', 'icone.ico') {
  if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { throw "$f não encontrado ao lado deste script." }
}

Write-Host @"
BrOWSER $Versao - o que este instalador vai fazer no seu computador:

  1. Copiar a ponte (bridge.exe) para $destino
  2. Registrar a ponte no Chrome, Brave, Edge e Chromium (chaves em HKCU\Software\...\NativeMessagingHosts)
  3. Adicionar o BrOWSER em "Aplicativos instalados" (para desinstalar por lá)
  4. No primeiro uso com o Gemini, adicionar o servidor "browser" e a regra "mcp(browser/*)"
     na configuração do Antigravity CLI (~\.gemini\antigravity-cli). Nada mais dessa configuração é alterado.

Privacidade:
  - O BrOWSER não envia seus dados para nós. O conteúdo da página vai para a IA que VOCÊ
    conectou (Google, OpenAI ou Anthropic) somente quando você faz um pedido no painel.
  - A ponte consulta o GitHub para baixar mapas públicos de sites (sem enviar dados seus).
  - O "aprendizado de formulários" guarda só a estrutura das páginas, no seu computador,
    e pode ser desligado no painel do BrOWSER.
  - Política completa: $privacidade

Para desfazer tudo: "Aplicativos instalados" > BrOWSER > Desinstalar.
"@

if (-not $Sim) {
  $ok = Read-Host 'Continuar com a instalação? (s/N)'
  if ($ok -notmatch '^[sS]') { Write-Host 'Instalação cancelada. Nada foi alterado.'; exit 1 }
}

New-Item -ItemType Directory -Force -Path $destino | Out-Null
foreach ($f in 'bridge.exe', 'uninstall.ps1', 'icone.ico') { Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $destino $f) -Force }
Write-Host "Ponte copiada para $destino"

& (Join-Path $destino 'bridge.exe') --install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar a ponte nos navegadores.' }

# Entrada em "Aplicativos instalados".
New-Item -Path $chaveApp -Force | Out-Null
$tamanhoKB = [int]((Get-ChildItem $destino | Measure-Object Length -Sum).Sum / 1KB)
$valores = @{
  DisplayName = 'BrOWSER'; DisplayVersion = $Versao; Publisher = 'BrOWSER (open source)'
  InstallLocation = $destino; DisplayIcon = (Join-Path $destino 'icone.ico')
  UninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $destino 'uninstall.ps1')`""
  URLInfoAbout = 'https://github.com/saironbusatto/BrOWSER'
}
foreach ($k in $valores.Keys) { Set-ItemProperty -Path $chaveApp -Name $k -Value $valores[$k] }
foreach ($k in 'NoModify', 'NoRepair') { Set-ItemProperty -Path $chaveApp -Name $k -Value 1 -Type DWord }
Set-ItemProperty -Path $chaveApp -Name EstimatedSize -Value $tamanhoKB -Type DWord

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
Write-Host 'Pronto. Feche e abra o navegador, abra o BrOWSER e conecte sua assinatura em Assinaturas > Conectar.'

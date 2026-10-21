# Instalador do BrOWSER para Windows (usuário final).
# Uso: deixe este arquivo ao lado de bridge.exe, uninstall.ps1 e icone.ico e rode:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# Não pede administrador: tudo vai para o perfil do usuário (%LOCALAPPDATA% e HKCU).
#   -Sim    não pede confirmação (CI)
#   -SemIA  não oferece instalar o Gemini (CI)
param([switch]$Sim, [switch]$SemIA, [string]$Versao = '0.5.1')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

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

New-Item -ItemType Directory -Force -Path $destino | Out-Null
foreach ($f in 'bridge.exe', 'uninstall.ps1', 'icone.ico') { Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $destino $f) -Force }
# A extensão vai junto: ninguem deveria descobrir, depois de instalar, que faltava um segundo
# download para o programa funcionar.
$extensao = Join-Path $destino 'extensao'
if (Test-Path (Join-Path $PSScriptRoot 'extensao\manifest.json')) {
  Remove-Item $extensao -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $PSScriptRoot 'extensao') $extensao -Recurse -Force
} else {
  throw 'A extensão não veio no pacote. Extraia o zip de novo, com todos os arquivos juntos.'
}
Write-Host "Ponte e extensão copiadas para $destino"

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

# Instalação automática das ferramentas de IA para uso com as assinaturas.
# 1. Antigravity CLI (Google AI Pro) - binário nativo, sem exigir admin ou Node.js.
# 2. Node.js + ChatGPT (codex) e Claude (claude) - se winget/npm estiverem disponíveis.
$urlAgy = 'https://antigravity.google/cli/install.ps1'
if (-not $SemIA) {
  $temAgy = (Get-Command agy -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $env:LOCALAPPDATA 'agy\bin\agy.exe'))
  if (-not $temAgy) {
    Write-Host ''
    Write-Host 'Instalando Antigravity CLI (Google AI Pro)...'
    try {
      $scriptContent = Invoke-RestMethod $urlAgy
      Invoke-Command -ScriptBlock ([scriptblock]::Create($scriptContent)) 2>&1 | ForEach-Object {
        $linha = "$_"
        if ($linha -notmatch 'logging before google\.Init') {
          Write-Host "  $linha"
        }
      }
      Write-Host '[OK] Antigravity CLI instalado com sucesso.'
    } catch {
      Write-Host "[!] Não foi possível instalar o Antigravity CLI automaticamente: $($_.Exception.Message)"
    }
  } else {
    Write-Host '[OK] Antigravity CLI (Google AI Pro) já instalado.'
  }

  $temNode = (Get-Command npm -ErrorAction SilentlyContinue) -or (Test-Path 'C:\Program Files\nodejs\npm.cmd')
  if (-not $temNode -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host 'Instalando Node.js para suporte a ChatGPT e Claude...'
    try {
      winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Null
      $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
      $temNode = (Get-Command npm -ErrorAction SilentlyContinue)
    } catch {
      Write-Host '[!] Node.js pulado.'
    }
  }

  if ($temNode) {
    Write-Host ''
    Write-Host 'Instalando ferramentas oficiais do ChatGPT (codex) e Claude...'
    try {
      npm install -g @openai/codex @anthropic-ai/claude-code 2>&1 | Out-Null
      Write-Host '[OK] ChatGPT (codex) e Claude instalados com sucesso.'
    } catch {
      Write-Host '[!] Falha ao instalar pacotes npm globais.'
    }
  }
}

# Um resumo na pasta, para quem abrir a pasta depois procurando o que fazer.
$resumo = Join-Path $destino 'INSTALADO.txt'
@(
  "BrOWSER $Versao instalado."
  "Instalado em: $destino"
  ''
  'Falta um passo manual, porque o Chrome não deixa um programa instale a extensão sem a sua confirmação:'
  '  1. Feche e abra de novo o navegador.'
  '  2. Em chrome://extensions, ative Modo do desenvolvedor.'
  '  3. Clique em Carregar sem compactação e escolha a pasta:'
  "     $extensao"
  ''
  'Para conferir o que falta em qualquer momento:'
  "  `"$destino\bridge.exe`" --doctor"
) | Set-Content -Path $resumo -Encoding UTF8

Write-Host ''
Write-Host 'Instalação concluída com sucesso!'
Write-Host ''
Write-Host 'ATENÇÃO: O BrOWSER é uma EXTENSÃO DE NAVEGADOR (Chrome/Edge/Brave).'
Write-Host 'Ele NÃO é um executável avulso. A ponte roda automaticamente quando a extensão chamar.'
Write-Host ''
Write-Host 'Próximo passo: no seu navegador (Chrome, Brave ou Edge):'
Write-Host '  1. Acesse: chrome://extensions'
Write-Host '  2. Ative "Modo do desenvolvedor" (canto superior direito)'
Write-Host '  3. Clique em "Carregar sem compactação" e selecione a pasta:'
Write-Host "     $extensao"
Write-Host ''
Write-Host 'Para conferir se está tudo pronto:'
Write-Host "  `"$destino\bridge.exe`" --doctor"

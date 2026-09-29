# Instalador do BrOWSER para Windows (usuário final).
# Uso: deixe este arquivo ao lado de bridge.exe, uninstall.ps1 e icone.ico e rode:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# Não pede administrador: tudo vai para o perfil do usuário (%LOCALAPPDATA% e HKCU).
#   -Sim    não pede confirmação (CI)
#   -SemIA  não oferece instalar o Gemini (CI)
param([switch]$Sim, [switch]$SemIA, [string]$Versao = '0.4.0')
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

# O Antigravity CLI (agy) é o caminho principal do BrOWSER — primeira opção, e a única que faz
# login OAuth da assinatura. ChatGPT (codex) e Claude (claude) são alternativas, para quem já
# tem uma delas; a ponte cai para elas quando o agy não está conectado.
#
# O instalador NÃO instala o agy por conta própria: mostra o comando oficial do Google e pergunta.
# A pessoa confirma, e o comando é o mesmo da documentação do Antigravity.
$urlAgy = 'https://antigravity.google/cli/install.ps1'
$comandoAgy = "irm $urlAgy | iex"
$temAgy = (Get-Command agy -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $env:LOCALAPPDATA 'agy\bin\agy.exe'))
if (-not $temAgy) {
  Write-Host ''
  Write-Host 'O Antigravity CLI (agy) não está instalado, e ele é o caminho principal do BrOWSER:'
  Write-Host 'é a única ferramenta que faz login OAuth da sua assinatura.'
  Write-Host "Instalador oficial do Google: $urlAgy"
  Write-Host ''
  if ($Sim) {
    Write-Host "Para instalar depois: $comandoAgy"
  } else {
    $resp = Read-Host 'Instalar agora? (s/N)'
    if ($resp -match '^[sS]') {
      Write-Host "Rodando: $comandoAgy"
      try {
        Invoke-RestMethod $urlAgy | Invoke-Expression
        Write-Host 'Antigravity CLI instalado. O login da sua assinatura e feito depois, no painel,'
        Write-Host 'em Assinaturas > Conectar.'
      } catch {
        Write-Host "A instalacao do Antigravity CLI falhou: $($_.Exception.Message)"
        Write-Host "Nada do BrOWSER foi afetado. Para instalar depois: $comandoAgy"
      }
    } else {
      Write-Host "Pulando. Se mudar de ideia: $comandoAgy"
      Write-Host 'ChatGPT (codex) e Claude (claude) tambem funcionam, se voce ja tiver algum deles.'
    }
  }
}

# Um resumo na pasta, para quem abrir a pasta depois procurando o que fazer.
$resumo = Join-Path $destino 'INSTALADO.txt'
@(
  "BrOWSER $Versao instalado."
  "Instalado em: $destino"
  ''
  'Falta um passo manual, porque o Chrome nao deixa um programa instalar extensao sem a sua confirmacao:'
  '  1. Feche e abra de novo o navegador.'
  '  2. Em chrome://extensions, ative Modo do desenvolvedor.'
  '  3. Clique em Carregar sem compactacao e escolha a pasta:'
  "     $extensao"
  ''
  'Para conferir o que falta em qualquer momento:'
  "  `"$destino\bridge.exe`" --doctor"
) | Set-Content -Path $resumo -Encoding UTF8

Write-Host ''
Write-Host 'Instalado. Para conferir se está tudo pronto:'
Write-Host "  `"$destino\bridge.exe`" --doctor"
Write-Host 'Depois: reinicie o navegador, e em chrome://extensions carregue a extensão da pasta extensao.'

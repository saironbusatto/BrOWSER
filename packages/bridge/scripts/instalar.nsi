; Instalador do BrOWSER para Windows, em NSIS.
;
; Por que um instalador de verdade, e nao um .cmd chamando o PowerShell: o duplo clique em .ps1
; nao e confiavel (o Windows pode abrir no Bloco de Notas em vez de executar), a ExecutionPolicy
; padrao recusa script baixado da internet, e a janela do console fecha antes da pessoa ler o
; resultado. Um .exe resolve os tres, e ainda da atalho no Menu Iniciar e desinstalador proprio.
;
; O trabalho de verdade ja existe em outro lugar: `bridge.exe --install` registra o host de
; Native Messaging nos navegadores e `--uninstall` desfaz. O que sobra para o instalador e
; copiar os arquivos, escrever a entrada em "Aplicativos instalados" e mostrar o que esta
; acontecendo com honestidade.
;
; Sem administrador: RequestExecutionLevel user, tudo em %LOCALAPPDATA% e HKCU. E nao da (e nao
; deve dar) para instalar em Arquivos de Programas sem elevate.
;
;   Compilar (roda no Linux tambem, o que importa porque o release acontece em ubuntu-latest):
;     printf '!define VERSAO "0.5.0"\n' > instalar-versao.nsh
;     makensis instalar.nsi
;
; A versao vem de um arquivo porque o -D na linha de comando se quebra no Windows: o makensis de
; la reparte "-DVERSAO=0.0.0" em "VERSAO=0" e um pedaco ".0.0" que ele tenta abrir como script.
; O idioma e PortugueseBR nas duas plataformas: "BrazilianPortuguese" e o nome do Inno Setup, e
; nao existe no NSIS. Nome errado aqui aborta o build, o que e melhor do que subir um instalador
; em ingles sem ninguem ter visto.
Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"

; A versao e o idioma chegam por um arquivo gerado pelo build, e nao por -D na linha de
; comando. No Linux o -D funciona; no Windows o makensis reparte o argumento com ponto e sobra
; um pedaco como nome de script ("VERSAO=0" e um script chamado ".0.0"). Um arquivo nao depende
; de como o shell repassa argumento, e ainda deixa o build das duas plataformas igual.
!include "instalar-versao.nsh"
; Fallback para quem compilar direto, sem passar pelo build. O VIProductVersion aborta o build se
; a versao nao for numerica de verdade, entao o fallback tem de ser.
!ifndef VERSAO
  !define VERSAO "0.0.0"
!endif
!define NOME "BrOWSER"
!define EDITOR "BrOWSER (open source)"
!define SITE "https://github.com/saironbusatto/BrOWSER"
!define CHAVE_SOFTWARE "Software\${NOME}"
Var MARCA

!define CHAVE_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\${NOME}"

Name "${NOME} ${VERSAO}"
OutFile "BrOWSER-Setup-${VERSAO}.exe"
InstallDir "$LOCALAPPDATA\BrOWSER"
InstallDirRegKey HKCU "${CHAVE_SOFTWARE}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show
BrandingText "${NOME} ${VERSAO}"

VIProductVersion "${VERSAO}.0"
VIAddVersionKey "ProductName" "${NOME}"
VIAddVersionKey "CompanyName" "${EDITOR}"
VIAddVersionKey "FileDescription" "Instalador do BrOWSER"
VIAddVersionKey "FileVersion" "${VERSAO}"
VIAddVersionKey "ProductVersion" "${VERSAO}"
VIAddVersionKey "LegalCopyright" "${NOME} - codigo aberto"

!define MUI_ABORTWARNING
!define MUI_ICON "icone.ico"
!define MUI_UNICON "icone.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\bridge.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Conferir agora se está tudo pronto (abre o --doctor, desmarcado por padrão)"
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; ---------------------------------------------------------------------------------------
; Texto. A pessoa le o que vai mudar no computador dela antes de instalar, e o que NAO vai
; mudar. Um "next, next, finish" sem isso e o jeito de um instalador perder a confianca de quem
; ainda nao conhece o programa - e de uma ferramenta que vai ler o formulario dela.
;
; As linhas continuam com "\" e a quebra e "\n": o parser do NSIS nao aceita uma quebra de
; linha crua dentro de uma string, e silenciosamente comeria o texto inteiro num build futuro.
; ---------------------------------------------------------------------------------------
!define MUI_WELCOMEPAGE_TEXT "O BrOWSER preenche formularios usando a sua propria assinatura de IA. Sem chave de API e sem servidor\
\nnosso. A ponte local liga a extensao do navegador a ferramenta que VOCE conectar; nenhuma das duas e\
\ninstalada para voce. O programa so organiza o que ja esta no seu computador.\n\
\n\
Instalar\n\
\n\
1. Copiar a ponte, a extensao e o icone para %LOCALAPPDATA%\BrOWSER\n\
2. Registrar a ponte nos navegadores Chromium que voce tenha: Chrome, Brave, Edge, Chromium,\
\nVivaldi e Opera. As chaves ficam so no seu usuario (HKCU); nada e instalado no sistema.\n\
3. Criar a entrada em $\"Aplicativos instalados$\", para desinstalar por la, e um atalho no Menu\
\nIniciar e na Area de Trabalho.\n\
4. Rodar o diagnostico, que diz se esta tudo pronto e o que falta.\n\
\n\
O QUE VOCE NAO PRECISA\n\
\n\
De administrador, de Node, de Bun, de Python e de npm.\n\
\n\
O QUE ISTO NAO FAZ\n\
\n\
- Nao instala ferramenta de IA. Google AI Pro (agy), ChatGPT (codex) e Claude (claude) tem\
\ninstalador oficial proprio. Escolher qual usar e seu, e o diagnostico avisa se voce nao tiver\
\nnenhuma instalada.\n\
- Nao instala a extensao no navegador: o Chrome nao permite que um programa instale extensao\
\nsem a sua confirmacao. O passo fica na tela final.\n\
- Nao mexe em nada fora desta pasta e dos registros do navegador.\n\
\n\
PRIVACIDADE\n\
\n\
O BrOWSER nao envia seus dados para nos: nao existe servidor nosso. O conteudo da pagina so vai\
\npara a IA que VOCE conectou, e so quando voce faz um pedido no painel. Campo de senha nunca e\
\nlido: a extensao sabe que o campo existe para poder preencher, mas nao le o que esta\
\ndentro. A ponte consulta o GitHub para baixar mapas publicos de sites, sem enviar dados\
\nseus. O $\"aprendizado de formularios$\" guarda so a estrutura das paginas, no seu\
\ncomputador, e pode ser desligado no painel. Politica completa: ${SITE}/blob/main/docs/termos-e-privacidade.md"

!define MUI_FINISHPAGE_TEXT "Instalado em $INSTDIR\n\
\n\
FALTA UM PASSO, E SO VOCE PODE DAR\n\
\n\
1. Feche e abra de novo o navegador. O registro da ponte foi feito depois que ele abriu.\n\
2. Abra chrome://extensions, ative $\"Modo do desenvolvedor$\" e clique em $\"Carregar sem\
\ncompactacao$\".\n\
3. Escolha a pasta: $INSTDIR\extensao\n\
4. Abra o painel do BrOWSER e conecte sua assinatura em Assinaturas > Conectar.\n\
\n\
Depois de instalado, este comando diz se esta tudo pronto, e o que falta se nao estiver:\n\
\n\
$INSTDIR\bridge.exe --doctor\n\
\n\
Para desinstalar: pelo botao aqui embaixo, ou em $\"Aplicativos instalados$\" > BrOWSER >\
\nDesinstalar."


Section "Instalar" SecMain
  DetailPrint "Instalando ${NOME} ${VERSAO} em $INSTDIR"
  StrCpy $MARCA "inicio em $INSTDIR"
  Call .marcar

  SetOutPath "$INSTDIR"
  File "bridge.exe"
  File "icone.ico"
  ; A extensao vai junto: ninguem deveria descobrir, depois de instalar, que faltava um segundo
  ; download para o programa funcionar.
  SetOutPath "$INSTDIR\extensao"
  File /r "extensao\*.*"
  SetOutPath "$INSTDIR"

  StrCpy $MARCA "arquivos copiados"
  Call .marcar
  ; Fecha a ponte de uma instalacao anterior. Sem isso, o desinstalador fica travado: o
  ; navegador mantem o executavel aberto enquanto a extensao esta ativa.
  ExecWait 'taskkill /F /IM bridge.exe >NUL 2>NUL'

  ; O registro nos navegadores e o proprio bridge que faz, e ele ja sabe onde foi instalado.
  ; Rodar daqui e rodar de la o mesmo codigo, em vez de duplicar aqui a lista de navegadores.
  DetailPrint "Registrando a ponte nos navegadores"
  StrCpy $MARCA "chamando bridge --install"
  Call .marcar
  ; Sem prazo: o ExecWait deste build aceita só o comando e o código de saída. O que sustenta a
  ; instalação é que o --install da ponte é só escrita de arquivo e quatro `reg add` síncronos, e
  ; nada ali pode ficar esperando. Se um dia travar, o rastro de etapas abaixo diz onde.
  ExecWait '"$INSTDIR\bridge.exe" --install' $0
  StrCpy $MARCA "registro terminou com codigo $0"
  Call .marcar
  ${If} $0 != "0"
    ; MessageBox é bloqueante, e o modo silencioso (/S) não o desliga. Deixar este diálogo sem
    ; guarda fez a primeira versão do instalador travar para sempre no runner: a ponte devolvia
    ; erro e o instalador ficava esperando alguém clicar numa janela que ninguém via.
    ${IfNot} ${Silent}
      MessageBox MB_ICONSTOP|MB_OK "Não foi possível registrar a ponte nos navegadores.$\r$\n$\r$\nO BrOWSER não foi instalado. Nada foi alterado no seu computador.$\r$\n$\r$\nCódigo do erro: $0"
    ${EndIf}
    StrCpy $MARCA "FALHOU no registro"
    Call .marcar
    Abort
  ${EndIf}

  StrCpy $MARCA "ponte registrada; escrevendo o desinstalador"
  Call .marcar
  WriteUninstaller "$INSTDIR\Uninstall ${NOME}.exe"
  WriteRegStr HKCU "${CHAVE_SOFTWARE}" "InstallDir" "$INSTDIR"

  ; Entrada em "Aplicativos instalados". O NSIS escreve o essencial sozinho, mas o nome, a
  ; versao e o tamanho sao reescritos para aparecerem certos no Painel de Controle.
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "DisplayName" "${NOME}"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "Publisher" "${EDITOR}"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "DisplayIcon" "$INSTDIR\icone.ico"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "URLInfoAbout" "${SITE}"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "HelpLink" "${SITE}"
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "UninstallString" '"$INSTDIR\Uninstall ${NOME}.exe"'
  WriteRegStr HKCU "${CHAVE_UNINSTALL}" "QuietUninstallString" '"$INSTDIR\Uninstall ${NOME}.exe" /S'
  WriteRegDWORD HKCU "${CHAVE_UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKCU "${CHAVE_UNINSTALL}" "NoRepair" 1

  StrCpy $MARCA "chaves e atalhos"
  Call .marcar
  CreateDirectory "$SMPROGRAMS\${NOME}"
  CreateShortCut "$SMPROGRAMS\${NOME}\BrOWSER.lnk" "$INSTDIR\Uninstall ${NOME}.exe"
  CreateShortCut "$SMPROGRAMS\${NOME}\Desinstalar BrOWSER.lnk" "$INSTDIR\Uninstall ${NOME}.exe"
  CreateShortCut "$DESKTOP\BrOWSER.lnk" "$INSTDIR\Uninstall ${NOME}.exe"

  ; Sem EstimatedSize de propósito. A única forma de calculá-lo é a função artificial do
  ; FileFunc, que é um recurso de runtime do NSIS sem garantia: se ela falhar, o instalador
  ; mostra um diálogo e trava. Um número cosmético em "Aplicativos instalados" não vale um
  ; instalador que pode não terminar.

  ; Um arquivo solto na pasta instalada, com o resumo. Serve a pessoa que abrir a pasta procurando
  ; o que fazer, e serve ao CI para conferir o que o instalador de fato fez — inclusive se os
  ; acentos sobreviveram a tudo isso e chegaram no arquivo.
  StrCpy $MARCA "escrevendo INSTALADO.txt"
  Call .marcar
  FileOpen $9 "$INSTDIR\INSTALADO.txt" w
  FileWrite $9 "BrOWSER ${VERSAO} instalado.$\r$\n"
  FileWrite $9 "Instalado em: $INSTDIR$\r$\n$\r$\n"
  FileWrite $9 "Para conferir se está tudo pronto, rode: bridge.exe --doctor$\r$\n"
  FileWrite $9 "Falta um passo manual, porque o Chrome não deixa um programa instalar extensão$\r$\n"
  FileWrite $9 "sem a sua confirmação:$\r$\n"
  FileWrite $9 "  1. Feche e abra de novo o navegador.$\r$\n"
  FileWrite $9 "  2. Em chrome://extensions, ative Modo do desenvolvedor.$\r$\n"
  FileWrite $9 "  3. Clique em Carregar sem compactação e escolha a pasta:$\r$\n"
  FileWrite $9 "     $INSTDIR\extensao$\r$\n"
  FileClose $9
  StrCpy $MARCA "instalacao concluida"
  Call .marcar
SectionEnd

Section "Desinstalar" UnSecMain
  DetailPrint "Desinstalando ${NOME}"
  StrCpy $MARCA "desinstalacao iniciada"
  Call .marcar

  ; A ponte desfaz o registro nos navegadores e apaga os dados locais antes da pasta sumir: depois
  ; que a pasta vai, o executavel que faria isso ja nao existe mais.
  IfFileExists "$INSTDIR\bridge.exe" 0 sem_ponte
    ExecWait 'taskkill /F /IM bridge.exe >NUL 2>NUL'
    ExecWait '"$INSTDIR\bridge.exe" --uninstall' $0
    Goto depois_ponte
  sem_ponte:
    DetailPrint "Ponte não encontrada; seguindo com a remoção da pasta."
  depois_ponte:

  StrCpy $MARCA "ponte desregistrada; limpando atalhos e pasta"
  Call .marcar
  Delete "$DESKTOP\BrOWSER.lnk"
  RMDir /r "$SMPROGRAMS\${NOME}"
  DeleteRegKey HKCU "${CHAVE_SOFTWARE}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${CHAVE_UNINSTALL}"

  StrCpy $MARCA "desinstalacao concluida"
  Call .marcar
  ${IfNot} ${Silent}
    MessageBox MB_ICONINFORMATION|MB_OK "BrOWSER removido deste computador.$\r$\n$\r$\nFalta um passo que nenhum programa pode fazer por você: remova a extensão em chrome://extensions.$\r$\n$\r$\nSem isso o ícone continua aparecendo e avisa “Ponte não conectada”. Se a extensão continuar carregada, use “Remover” na própria tela do chrome://extensions."
  ${EndIf}
SectionEnd

; ---------------------------------------------------------------------------------------
; Este arquivo precisa estar em UTF-8 COM BOM.
;
; O makensis do Windows le o script na pagina de codigo do sistema (ACP, 1252 no runner) quando
; nao ha BOM, e ai todo acento desta interface - que existe justamente para a pessoa confiar no
; que esta lendo antes de instalar - vira lixo. O BOM e o que faz o makensis assumir UTF-8.
;
; Nao da para provar isso no build do Linux: o pacote Debian do NSIS le UTF-8 sempre. A prova de
; verdade e o INSTALADO.txt, que o instalador escreve em tempo de execucao e que o CI do Windows
; le conferindo palavra acentuada por palavra acentuada.
; ---------------------------------------------------------------------------------------

; Uma linha por etapa num arquivo. Sem isso, um instalador que trava em /S não diz nada: o
; primeiro sintoma é só a ausência de saída, e caçar a etapa exata no escuro é o que travou este
; trabalho. /S não mostra a janela de detalhes, então o rastro precisa existir em disco.
; `LogSet` resolveria, mas só existe em build de debug do NSIS, e o release compila com o normal.
;
; `Function .marcar` e não `Function marcar`: sem o ponto, o NSIS lê a função como sendo do
; desinstalador e o build aborta. E a chamada é `Call .marcar`, não `Call :marcar` — os dois
; pontos procuram um rótulo, e o texto não cabe como argumento com espaço, então vai por variável.
Function .marcar
  FileOpen $9 "$TEMP\instalar-${NOME}.log" a
  FileWrite $9 "$MARCA$\r$\n"
  FileClose $9
FunctionEnd

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
;     makensis -DVERSAO=0.5.0 -DIDIOMA=PortugueseBR instalar.nsi
;
; O -DIDIOMA existe porque o NSIS nomeia o arquivo de idioma diferente em cada plataforma:
; "BrazilianPortuguese.nlf" na instalacao do Windows, "PortugueseBR.nlf" no pacote Linux. Se o
; nome estiver errado, o NSIS aborta o build em vez de sair um instalador em ingles silencioso.
Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include /NONFATAL "FileFunc.nsh"

!ifndef VERSAO
  !define VERSAO "0.5.0"
!endif
!ifndef IDIOMA
  !define IDIOMA "BrazilianPortuguese"
!endif
!define NOME "BrOWSER"
!define EDITOR "BrOWSER (open source)"
!define SITE "https://github.com/saironbusatto/BrOWSER"
!define CHAVE_SOFTWARE "Software\${NOME}"
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
!define MUI_FINISHPAGE_RUN_TEXT "Conferir agora se esta tudo pronto (abre o diagnóstico)"
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "${IDIOMA}"

Var DIAGNOSTICO

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

  SetOutPath "$INSTDIR"
  File "bridge.exe"
  File "icone.ico"
  ; A extensao vai junto: ninguem deveria descobrir, depois de instalar, que faltava um segundo
  ; download para o programa funcionar.
  SetOutPath "$INSTDIR\extensao"
  File /r "extensao\*.*"
  SetOutPath "$INSTDIR"

  ; Fecha a ponte de uma instalacao anterior. Sem isso, o desinstalador fica travado: o
  ; navegador mantem o executavel aberto enquanto a extensao esta ativa.
  ExecWait 'taskkill /F /IM bridge.exe >NUL 2>NUL'

  ; O registro nos navegadores e o proprio bridge que faz, e ele ja sabe onde foi instalado.
  ; Rodar daqui e rodar de la o mesmo codigo, em vez de duplicar aqui a lista de navegadores.
  DetailPrint "Registrando a ponte nos navegadores"
  ExecWait '"$INSTDIR\bridge.exe" --install' $0
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP|MB_OK "Nao foi possivel registrar a ponte nos navegadores.$\r$\n$\r$\nO BrOWSER nao foi instalado. Nada foi alterado no seu computador.$\r$\n$\r$\nCodigo do erro: $0"
    Abort
  ${EndIf}

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

  CreateDirectory "$SMPROGRAMS\${NOME}"
  CreateShortCut "$SMPROGRAMS\${NOME}\BrOWSER.lnk" "$INSTDIR\Uninstall ${NOME}.exe"
  CreateShortCut "$SMPROGRAMS\${NOME}\Desinstalar BrOWSER.lnk" "$INSTDIR\Uninstall ${NOME}.exe"
  CreateShortCut "$DESKTOP\BrOWSER.lnk" "$INSTDIR\Uninstall ${NOME}.exe"

  ; O diagnostico e a resposta para "isso funciona na minha maquina?". Rodar aqui e o melhor
  ; momento: a pessoa ainda esta olhando para a tela do instalador.
  DetailPrint "Rodando o diagnóstico"
  ExecWait '"$INSTDIR\bridge.exe" --doctor' $0
  ${If} $0 == "0"
    StrCpy $DIAGNOSTICO 1
    DetailPrint "Diagnóstico: tudo pronto."
  ${Else}
    DetailPrint "Diagnóstico: ainda falta algo."
  ${EndIf}

  ; O tamanho da pasta, agora que a extensao esta dentro, para o Painel de Controle mostrar o
  ; numero certo. GetSize devolve tres: tamanho em KB, em bytes, e quantos arquivos.
  ${GetSize} "$INSTDIR" "/S=1K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${CHAVE_UNINSTALL}" "EstimatedSize" "$0"
  WriteRegStr HKCU "${CHAVE_SOFTWARE}" "DiagnosticoOk" "$DIAGNOSTICO"

  ; Um arquivo solto na pasta instalada, com o resumo. Serve a pessoa que abrir a pasta procurando
  ; o que fazer, e serve ao CI para conferir o que o instalador de fato fez — inclusive se os
  ; acentos sobreviveram a tudo isso e chegaram no arquivo.
  FileOpen $9 "$INSTDIR\INSTALADO.txt" w
  FileWrite $9 "BrOWSER ${VERSAO} instalado.$\r$\n"
  FileWrite $9 "Instalado em: $INSTDIR$\r$\n$\r$\n"
  FileWrite $9 "Diagnóstico na instalação: $DIAGNOSTICO (0 = tudo pronto, 1 = falta algo).$\r$\n"
  FileWrite $9 "Rode bridge.exe --doctor para ver o que falta.$\r$\n$\r$\n"
  FileWrite $9 "Falta um passo manual, porque o Chrome não deixa um programa instalar extensão$\r$\n"
  FileWrite $9 "sem a sua confirmação:$\r$\n"
  FileWrite $9 "  1. Feche e abra de novo o navegador.$\r$\n"
  FileWrite $9 "  2. Em chrome://extensions, ative Modo do desenvolvedor.$\r$\n"
  FileWrite $9 "  3. Clique em Carregar sem compactação e escolha a pasta:$\r$\n"
  FileWrite $9 "     $INSTDIR\extensao$\r$\n"
  FileClose $9
SectionEnd

Section "Desinstalar" UnSecMain
  DetailPrint "Desinstalando ${NOME}"

  ; A ponte desfaz o registro nos navegadores e apaga os dados locais antes da pasta sumir: depois
  ; que a pasta vai, o executavel que faria isso ja nao existe mais.
  IfFileExists "$INSTDIR\bridge.exe" 0 sem_ponte
    ExecWait 'taskkill /F /IM bridge.exe >NUL 2>NUL'
    ExecWait '"$INSTDIR\bridge.exe" --uninstall' $0
    Goto depois_ponte
  sem_ponte:
    DetailPrint "Ponte não encontrada; seguindo com a remoção da pasta."
  depois_ponte:

  Delete "$DESKTOP\BrOWSER.lnk"
  RMDir /r "$SMPROGRAMS\${NOME}"
  DeleteRegKey HKCU "${CHAVE_SOFTWARE}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${CHAVE_UNINSTALL}"

  MessageBox MB_ICONINFORMATION|MB_OK "BrOWSER removido deste computador.$\r$\n$\r$\nFalta um passo que nenhum programa pode fazer por você: remova a extensão em chrome://extensions.$\r$\n$\r$\nSem isso o ícone continua aparecendo e avisa “Ponte não conectada”. Se a extensão continuar carregada, use “Remover” na própria tela do chrome://extensions."
SectionEnd

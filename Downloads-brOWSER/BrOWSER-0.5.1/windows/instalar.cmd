@echo off
title BrOWSER - instalacao
REM ===================================================================
REM  BrOWSER - instalador para Windows.
REM
REM  Clique duas vezes NESTE arquivo (e nao no setup.ps1).
REM
REM  Esta janela DEVE ficar aberta ate o fim. Se ela sumir na hora de
REM  clicar, ou se aparecer e fechar sem texto, o problema e o Windows e
REM  nao o instalador: e o arquivo de origem, uma politica da maquina ou
REM  o antivirus. Este script comeca falando antes de qualquer verificacao
REM  justamente para nunca haver um clique sem resposta.
REM
REM  Sem acentos de proposito: o console do .cmd usa a pagina de codigo do
REM  sistema, e texto acentuado vira lixo em maquina fora do UTF-8.
REM
REM    instalar.cmd          instala, perguntando antes
REM    instalar.cmd -sim     instala sem perguntar (CI)
REM ===================================================================

echo.
echo ============================================================
echo   BrOWSER - instalador
echo   Esta janela vai ficar aberta ate o fim.
echo ============================================================
echo.
echo Origem: %~dp0
echo.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
set ERRO=0
set PAUSA=on
set PSARGS=
for %%A in (%*) do (
  if /i "%%~A"=="-sim" (
    set PAUSA=off
    set PSARGS=!PSARGS! -Sim
  )
  if /i "%%~A"=="-semia" set PSARGS=!PSARGS! -SemIA
)

REM ---- o que veio junto -------------------------------------------------------------
echo O que ha nesta pasta:
dir /b 2>nul | findstr /v "^$" || echo   (vazio)
echo.

if not exist "%~dp0setup.ps1" (
  echo [ERRO] O setup.ps1 NAO esta nesta pasta.
  echo.
  echo Se voce abriu o .zip e clicou DENTRO dele, e este e o motivo: o Windows
  echo extrai so o arquivo clicado para uma pasta temporaria, sem o resto.
  echo.
  echo   1. Abra a pasta BrOWSER-windows
  echo   2. Clique com o botao direito no .zip  ^>  Extrair tudo
  echo   3. Entre na pasta extraida e clique em instalar.cmd
  echo.
  set ERRO=1
  goto :fim
)

if not exist "%~dp0bridge.exe" (
  echo [ERRO] O bridge.exe NAO esta nesta pasta.
  set ERRO=1
  goto :fim
)
if not exist "%~dp0extensao\manifest.json" (
  echo [ERRO] A pasta extensao NAO veio no pacote.
  set ERRO=1
  goto :fim
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Nao encontrei o PowerShell, de que o Windows precisa para isto.
  echo Se a sua versao do Windows for muito antiga, atualize-a.
  set ERRO=1
  goto :fim
)
echo PowerShell: ok
echo.

REM Arquivo baixado pelo navegador vem com Zone.Identifier e o Windows recusa rodar
REM script. Unblock-File tira a marca; sem marca nenhuma, apenas nao faz nada.
echo Removendo a marca de "baixado da internet"...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%~dp0setup.ps1','%~dp0uninstall.ps1' -ErrorAction SilentlyContinue" >nul 2>&1
echo.

echo Iniciando a instalacao...
echo ------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"!PSARGS!
set CODIGO=%ERRORLEVEL%
echo ------------------------------------------------------------------
echo.
if not "%CODIGO%"=="0" (
  echo [ERRO] A instalacao terminou com codigo %CODIGO%.
  echo Leia a mensagem acima. Nada foi alterado no seu computador.
  set ERRO=1
  goto :fim
)

echo [OK] Instalacao concluida.
echo.
echo Falta um passo, porque o Chrome nao deixa nenhum programa instalar extensao
echo sem a sua confirmacao:
echo   1. Feche e abra de novo o navegador
echo   2. Em chrome://extensions, ative Modo do desenvolvedor
echo   3. Clique em "Carregar sem compactacao" e escolha a pasta extensao
echo      que esta ao lado deste arquivo
echo.
echo Para conferir se esta tudo certo:
echo   "%LOCALAPPDATA%\BrOWSER\bridge.exe" --doctor
echo.
echo Para desinstalar: Aplicativos instalados ^> BrOWSER ^> Desinstalar

:fim
echo.
echo ============================================================
if "!ERRO!"=="0" (echo   Terminado. Pode fechar esta janela.) else (echo   Houve um problema. A mensagem esta acima.)
echo ============================================================
if "!PAUSA!"=="on" pause
exit /b !ERRO!

#!/bin/bash
# Monta os pacotes de release localmente, para testar numa máquina de verdade antes de subir.
#
# Faz exatamente o que o .github/workflows/release.yml faz, sem depender do CI. É o que
# permite entregar um arquivo para a pessoa instalar e testar no Windows dela, em vez de
#Descobrir o problema lá.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
VERSAO=${VERSAO:-0.5.1}
SAIDA=${SAIDA:-"$RAIZ/Downloads-brOWSER"}
SAIDA="$SAIDA/BrOWSER-$VERSAO"

cd "$RAIZ"
echo "==> verificando antes de empacotar"
bun run lint
bun run typecheck

echo "==> compilando a extensão"
bun run --cwd packages/extension build

echo "==> compilando a ponte para Linux e para Windows"
bun run --cwd packages/bridge build
bun run --cwd packages/bridge build:win
# MZ = Portable Executable. Um ELF com nome de .exe significaria que o build "de Windows" saiu
# Linux, que foi exatamente o bug que já aconteceu uma vez.
head -c2 packages/bridge/dist/bridge.exe | grep -q 'MZ' || { echo 'bridge.exe não é um PE'; exit 1; }
head -c4 packages/bridge/dist/bridge | grep -q $'\x7fELF' || { echo 'bridge não é um ELF'; exit 1; }
test -x packages/bridge/dist/bridge || { echo 'bridge sem permissão de execução'; exit 1; }

echo "==> montando os pacotes em $SAIDA"
rm -rf "$SAIDA"; mkdir -p "$SAIDA"/{windows,linux}

# A extensão vai DENTRO de cada pacote: uma máquina virgem não deveria precisar baixar dois
# arquivos e descobrir qual é o quê.
for alvo in windows linux; do
  cp -r packages/extension/.output/chrome-mv3 "$SAIDA/$alvo/extensao"
done

cp packages/bridge/dist/bridge.exe "$SAIDA/windows/"
cp packages/bridge/scripts/setup.ps1 packages/bridge/scripts/uninstall.ps1 packages/bridge/scripts/instalar.cmd "$SAIDA/windows/"
cp design/icone.ico LICENSE "$SAIDA/windows/"

cp packages/bridge/dist/bridge "$SAIDA/linux/"
cp packages/bridge/scripts/install.sh packages/bridge/scripts/leia-me.md "$SAIDA/linux/"
cp LICENSE "$SAIDA/linux/"

# A versão vai para dentro dos dois instaladores, senão o "Aplicativos instalados" mostra a
# versão do dia anterior e não dá para saber o que está rodando.
sed "s/\[string\]\$Versao = '[^']*'/[string]\$Versao = '$VERSAO'/" packages/bridge/scripts/setup.ps1 > "$SAIDA/windows/setup.ps1"
grep -q "\\\$Versao = '$VERSAO'" "$SAIDA/windows/setup.ps1" || { echo 'a versão não entrou no setup.ps1'; exit 1; }
sed "s/^VERSAO=\".*\"$/VERSAO=\"$VERSAO\"/" packages/bridge/scripts/install.sh > "$SAIDA/linux/install.sh"
grep -q "^VERSAO=\"$VERSAO\"" "$SAIDA/linux/install.sh" || { echo 'a versão não entrou no install.sh'; exit 1; }
chmod +x "$SAIDA/linux/bridge" "$SAIDA/linux/install.sh"

echo "==> conferindo o conteúdo de cada pacote"
for f in "$SAIDA/windows/bridge.exe" "$SAIDA/windows/setup.ps1" "$SAIDA/windows/uninstall.ps1" \
         "$SAIDA/windows/instalar.cmd" "$SAIDA/windows/icone.ico" "$SAIDA/windows/extensao/manifest.json" \
         "$SAIDA/linux/bridge" "$SAIDA/linux/install.sh" "$SAIDA/linux/leia-me.md" "$SAIDA/linux/extensao/manifest.json"; do
  test -f "$f" || { echo "faltando no pacote: ${f#$SAIDA/}"; exit 1; }
done

echo "==> compactando"
(cd "$SAIDA/windows" && zip -q -r "$SAIDA/BrOWSER-windows.zip" .)
(cd "$SAIDA/linux" && tar -czf "$SAIDA/BrOWSER-linux.tar.gz" .)
(cd packages/extension/.output/chrome-mv3 && zip -q -r "$SAIDA/BrOWSER-extensao.zip" .)
for p in BrOWSER-windows.zip BrOWSER-linux.tar.gz BrOWSER-extensao.zip; do
  test -s "$SAIDA/$p" || { echo "pacote vazio: $p"; exit 1; }
done

echo
echo "==> pronto"
ls -la "$SAIDA" | sed "s|$SAIDA/||"

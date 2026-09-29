#!/usr/bin/env bash
# Instalador do BrOWSER para Linux (usuário final).
#
# Machine virgem: baixe o .tar.gz do release, extraia, rode este script. Ele não
# pede root — tudo vai para o perfil do usuário (~/.local/share/BrOWSER e ~/.config).
#
#   ./install.sh              instala (mostra o que vai fazer e pede confirmação)
#   ./install.sh --sim        instala sem perguntar (CI)
#   ./install.sh --desinstalar  desfaz tudo
#
# Uma limitação que não dá para remover: o Chrome não deixa extensão não assinada se
# instalar sozinha. Alguém precisa clicar em "Carregar sem compactação". O script deixa
# isso em uma linha, com o caminho exato.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="${XDG_DATA_HOME:-$HOME/.local/share}/BrOWSER"
VERSAO="0.5.0"
PRIVACIDADE="https://github.com/saironbusatto/BrOWSER/blob/main/docs/termos-e-privacidade.md"
SIM=0
ACAO=instalar

for arg in "$@"; do
  case "$arg" in
    --sim|-y) SIM=1 ;;
    --desinstalar|--uninstall) ACAO=desinstalar ;;
    --versao|--version) echo "$VERSAO"; exit 0 ;;
    -h|--help) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- desinstalar
if [ "$ACAO" = "desinstalar" ]; then
  cat <<TXT
BrOWSER $VERSAO - o que será removido:

  1. O registro da ponte nos navegadores (~/.config/*/NativeMessagingHosts)
  2. A integração "browser" e a regra de permissão com o Antigravity CLI
  3. Os dados locais: ~/.config/browser-bridge (estado, log, cache de blueprints)
  4. A pasta de instalação: $DESTINO

TXT
  if [ "$SIM" -ne 1 ]; then
    read -r -p "Continuar? (s/N) " r || true
    case "$r" in [sS]*) ;; *) echo "Cancelado. Nada foi alterado."; exit 1 ;; esac
  fi
  if [ -x "$DESTINO/bridge" ]; then "$DESTINO/bridge" --uninstall; fi
  rm -rf "$DESTINO"
  echo "✓ $DESTINO removido"
  echo ""
  echo "Falta um passo que este script não pode fazer: remova a extensão em"
  echo "chrome://extensions. Sem isso, o ícone continua aparecendo e avisa 'Ponte não conectada'."
  exit 0
fi

# ------------------------------------------------------------------- instalar
for f in bridge extensao; do
  if [ ! -e "$AQUI/$f" ]; then
    echo "Falta '$f' ao lado deste script." >&2
    echo "O pacote do release tem que vir com o binário e a pasta 'extensao'." >&2
    exit 1
  fi
done
if [ ! -x "$AQUI/bridge" ] && ! command -v "$AQUI/bridge" >/dev/null 2>&1; then
  chmod +x "$AQUI/bridge"
fi

cat <<TXT
BrOWSER $VERSAO - o que este instalador vai fazer no seu computador:

  1. Copiar a ponte e a extensão para
       $DESTINO
  2. Registrar a ponte nos navegadores Chromium que você tem (Chrome, Brave, Edge,
     Chromium, Vivaldi, Opera) — em ~/.config, sem tocar em nada do sistema
  3. Apontar no instalador para você desinstalar depois com:
       $DESTINO/install.sh --desinstalar

Um passo fica com você, porque o Chrome não permite que um programa instale extensão
sem sua confirmação:

  4. Reiniciar o navegador e carregar a extensão em chrome://extensions
     (Modo do desenvolvedor → Carregar sem compactação → escolher a pasta)

Privacidade:
  - O BrOWSER não envia seus dados para nós. O conteúdo da página vai para a IA que
    VOCÊ conectou (Google, OpenAI ou Anthropic) só quando você faz um pedido no painel.
  - A ponte consulta o GitHub para baixar mapas públicos de sites (sem enviar dados seus).
  - O "aprendizado de formulários" guarda só a estrutura das páginas, no seu computador,
    e pode ser desligado no painel do BrOWSER.
  - Política completa: $PRIVACIDADE

TXT

if [ "$SIM" -ne 1 ]; then
  read -r -p "Continuar com a instalação? (s/N) " r || true
  case "$r" in [sS]*) ;; *) echo "Instalação cancelada. Nada foi alterado."; exit 1 ;; esac
fi

mkdir -p "$DESTINO"
rm -rf "$DESTINO/extensao"
cp -r "$AQUI/extensao" "$DESTINO/extensao"
cp -f "$AQUI/bridge" "$DESTINO/bridge"
cp -f "$AQUI/install.sh" "$DESTINO/install.sh"
chmod 0755 "$DESTINO/bridge" "$DESTINO/install.sh"
if [ -f "$AQUI/leia-me.md" ]; then cp -f "$AQUI/leia-me.md" "$DESTINO/leia-me.md"; fi
echo "✓ ponte e extensão copiadas para $DESTINO"

"$DESTINO/bridge" --install
echo "✓ ponte registrada nos navegadores"

# O Antigravity CLI (agy) é o caminho principal do BrOWSER — primeira opção, e a única que faz
# login OAuth da assinatura. ChatGPT (codex) e Claude (claude) são alternativas, usadas quando a
# pessoa já tem uma delas; a ponte cai para elas se o agy não estiver conectado.
#
# O instalador NÃO instala agy por conta própria: mostra o comando oficial do Google e pergunta.
# A pessoa confirma, e o comando é o mesmo que está na documentação do Antigravity. Baixar e
# executar um script remoto é o que o instalador faz aqui, e só com o "s" da pessoa.
URL_AGY="https://antigravity.google/cli/install.sh"
COMANDO_AGY="curl -fsSL ${URL_AGY} | bash"
if [ "$SIM" -ne 1 ] && ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
  echo ""
  echo "O Antigravity CLI (agy) não está instalado, e ele é o caminho principal do BrOWSER:"
  echo "é a única ferramenta que faz login OAuth da assinatura."
  echo "Instalador oficial do Google: $URL_AGY"
  echo ""
  printf "Instalar agora? (s/N) "
  r=""
  read -r r || true
  case "$r" in
    [sS]*)
      echo "Rodando: $COMANDO_AGY"
      if bash -c "$COMANDO_AGY"; then
        echo "✓ Antigravity CLI instalado. O login da sua assinatura é feito depois, no painel,"
        echo "  em Assinaturas > Conectar."
      else
        echo "! A instalação do Antigravity CLI falhou. Nada do BrOWSER foi afetado."
        echo "  Se preferir, instale depois com: $COMANDO_AGY"
      fi
      ;;
    *)
      echo "Pulando. Se mudar de ideia, é só rodar: $COMANDO_AGY"
      echo "ChatGPT (codex) e Claude (claude) também funcionam, se você já tiver algum deles."
      ;;
  esac
elif [ "$SIM" -eq 1 ] && ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
  echo ""
  echo "O Antigravity CLI (agy) não está instalado. Para o Google AI Pro, o instalador"
  echo "oficial do Google é: $COMANDO_AGY"
fi

echo ""
echo "Instalado. Antes de abrir o navegador, confira o que esta máquina tem:"
echo "  $DESTINO/bridge --doctor"

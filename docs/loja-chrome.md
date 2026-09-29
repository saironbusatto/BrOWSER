# Listagem da Chrome Web Store — conteúdo pronto para colar

Painel: https://chrome.google.com/webstore/devconsole
Pacote: `BrOWSER-extensao.zip` (versão 0.5.0, ícone 128×128, arquivos na raiz do zip)
Política de privacidade: https://saironbusatto.github.io/BrOWSER/privacidade.html

> O campo `key` no manifesto preserva o ID `kofljccjbobcbcfnnolfgbobkckmiboe` entre atualizações.
> Nenhuma captura de tela ou texto desta página deve ir para dentro do pacote; a loja recusa zip com arquivos extras desnecessários, e o pacote atual já está limpo.

---

## Nome (limite 45)

```
BrOWSER
```

---

## Resumo / descrição curta (limite 132)

```
Preenche formulários da página com a assinatura de IA que você já paga. Sem chave de API, sem servidor nosso.
```

---

## Descrição detalhada (limite 16000)

```
O BrOWSER preenche formulários da página que você já está usando a partir de um pedido em linguagem natural — usando a assinatura de IA que você JÁ PAGA (Google AI Pro, ChatGPT ou Claude). Sem chave de API. Sem cadastro. Sem servidor nosso no meio.

O que ele faz

Você abre a página, abre o painel lateral e escreve o que precisa: "preenche meus dados de entrega e avança até o pagamento". O BrOWSER entende a página, preenche os campos e navega. Você continua no controle a cada passo.

Você continua sendo quem envia

Esta é a diferença que importa. A IA pode preencher, mas o envio é seu. A ponte recusa, por código, clicar em botão de envio final — mesmo que a IA peça. Avançar, filtrar, salvar rascunho, calcular: tudo liberado. Enviar, nunca. Não é instrução no prompt; é uma trava no código.

Sua senha é intocável

A extensão lê a estrutura da página (rótulos, tipos de campo, botões), nunca o que você digitou. Campos de senha são explicitamente ignorados na leitura e nunca são transmitidos a nenhum provedor de IA. Isso é aplicado em código, com filtros no servidor e no cliente, e está escrito na política de privacidade.

Funciona com o que você já tem

Não exigimos chave de API nem assinatura nova. O BrOWSER conversa com a ferramenta oficial da IA que já está instalada e logada na sua máquina (agy, codex ou claude) por um protocolo padrão. Se você não tem nenhuma delas logada, o diagnóstico avisa o que falta antes de você começar.

Transparente por padrão

- Você vê o que a IA está lendo, em tempo real.
- Botão Parar derruba a operação no instante.
- O código é aberto e a política de privacidade é pública.

Para quem serve

Quem já preenche os mesmos formulários todo dia: notas fiscais, cadastros, pedidos, protocolos, sistemas internos. O BrOWSER não substitui a sua assinatura de IA — ele usa a que você tem.

Instalação

A extensão está na Chrome Web Store. Ela conversa com uma ponte local (programa pequeno instalado no seu computador), porque uma extensão sozinha não consegue executar programas. A ponte é open source, auditável e o instalador pergunta antes de instalar qualquer coisa.

Requisitos

- Navegador Chromium (Chrome, Edge, Brave) com a extensão instalada pela loja.
- Ponte local BrOWSER instalada.
- Uma ferramenta de IA oficial instalada e autenticada no seu computador.

Perguntas frequentes

A extensão acessa meus dados?
Só quando você pede, e apenas para preencher o que foi pedido. A navegação normal do navegador nunca é interceptada fora de uma ação sua.

O BrOWSER envia meus dados para servidores de vocês?
Não. Não temos servidor de processamento. O conteúdo da página é entregue apenas ao provedor de IA que você escolheu, usando a sua própria conta e a sua própria assinatura.

Funciona no Firefox?
O motor é o mesmo e a base existe, mas a primeira versão homologada é para navegadores Chromium.

Posso cancelar?
Sim. Botão Parar, e desinstalar a extensão e a ponte a qualquer momento.
```

---

## Finalidade única (limite 1000) — campo obrigatório da loja

```
O BrOWSER preenche formulários da web que o usuário já está visualizando, a partir de um pedido escrito em linguagem natural, utilizando a assinatura de IA que o usuário já possui. A extensão apenas lê a estrutura da página e preenche campos; ela nunca envia o formulário, e o clique final de envio permanece sob decisão exclusiva do usuário.
```

---

## Categoria

```
Productivity  (Produtividade)
```

---

## Justificativa das permissões

O formulário da loja pede justificativa escrita para permissões sensíveis. Textos prontos:

| Permissão | Justificativa para colar |
|---|---|
| `debugger` | Necessária para ler a estrutura completa da página e o conteúdo visível, de forma confiável em sites que bloqueiam a leitura por content script (iframes de terceiros, SPAs). Usada somente durante uma ação explícita do usuário no painel. Nenhuma informação de navegação é coletada fora dessa ação. |
| `nativeMessaging` | Necessária para a extensão se comunicar com a ponte local (programa instalado no computador do usuário), que por sua vez usa a ferramenta oficial de IA do próprio usuário. A extensão não funciona sem essa ponte. |
| `<all_urls>` | Necessária porque o usuário preenche formulários em qualquer site — a extensão não pode saber de antemão em qual domínio o formulário está. O acesso só ocorre durante uma ação explícita do usuário, na aba que ele está usando. |
| `tabs` | Usada para identificar e operar a aba ativa que o usuário está visualizando. |
| `webNavigation` | Usada para detectar a navegação dentro do fluxo e manter o contexto da aba correta durante a ação. |
| `scripting` | Necessária para injetar o leitor de página nas páginas onde a extensão precisa operar. |
| `sidePanel` | É a interface do produto: o painel lateral onde o usuário escreve o pedido e acompanha o que está acontecendo. |
| `storage` | Guarda apenas preferências locais do usuário (como a ferramenta de IA escolhida). Nada é enviado para fora. |

---

## Privacy practices — respostas do formulário

| Pergunta da loja | Resposta |
|---|---|
| Coleta ou compartilhamento de dados do usuário | **Não** — o desenvolvedor não coleta nem compartilha. Ver justificativa abaixo. |
| Dados transmitidos a terceiros, não coletados | Sim, apenas ao provedor de IA escolhido pelo próprio usuário, usando a conta e a assinatura dele. Descrito na política de privacidade. |
| Dados pessoais coletados | Nenhum. |
| Atividade de navegação / conteúdo de sites | Processado sob comando do usuário e entregue apenas ao provedor de IA que ele escolheu. Não é retido nem compartilhado com o desenvolvedor. |
| Código remoto | Não. Todo o código é executado localmente ou vem da ferramenta oficial do próprio usuário. |
| Funções de IA | Sim — a extensão interage com um modelo de IA, mas **somente** a ferramenta oficial que o usuário já instalou e autenticou. A loja deve ser informada disso claramente. |
| Política de privacidade | https://saironbusatto.github.io/BrOWSER/privacidade.html |
| Justificativa única em frase | "Preenche formulários da página atual a partir de um pedido em linguagem natural, com a assinatura de IA que o usuário já tem." |

---

## Itens obrigatórios que ainda faltam

- [ ] **Capturas de tela** — a loja exige no mínimo 1, recomendado 1280×800. Sugestão: painel lateral aberto mostrando (1) o pedido em linguagem natural, (2) a lista de campos detectados da página, (3) o estado "Pronto para enviar" provando que o envio não acontece sozinho.
- [ ] **Ícone** — o do pacote serve (128×128). A loja usa esse mesmo ícone na listagem.
- [ ] **Escolher países / idioma** — começar em Português (Brasil); Cadastrar também em inglês aumenta o alcance.
- [ ] **Classificação de conteúdo** — declarar que não há conteúdo impróprio.
- [ ] **Enviar para revisão** — a revisão costuma levar de 1 a 7 dias, e o time do Chrome pode pedir esclarecimento sobre `debugger` e `<all_urls>`. Responder citando a finalidade única e a trava de envio é o argumento mais forte.

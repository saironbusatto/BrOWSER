# Excel na web: ler e escrever célula com precisão

A grade do Excel na web é desenhada como imagem: `ler_pagina` e `ler_campos` não leem o conteúdo
das células, e `ver_tela` mostra só a parte visível, com risco de ler número errado. Quem tem o
valor exato, como texto, é a **barra de fórmulas** da célula selecionada.

## 1. Ler uma célula (valor exato)

1. Vá até a célula: clique em "Localizar e Selecionar" (guia Início) → "Ir para", escreva o
   endereço (ex.: `B7`) no campo de referência e clique em OK. Alternativa: clique na
   "Caixa de Nome", escreva o endereço e confira com `ver_tela` se a seleção foi para lá.
2. Leia com `ler_campos`: o campo **"formula bar"** traz o conteúdo da célula.
3. Se começar com `=`, é fórmula: o resultado aparece na grade (confira com `ver_tela`).

Para percorrer várias células, com a planilha em foco: `teclar` ArrowDown/ArrowRight e leia a
"formula bar" de novo a cada passo. É lento, mas exato. Para uma visão geral, use `ver_tela`
(o botão "Reduzir" diminui o zoom e mostra mais linhas).

## 2. Escrever numa célula (sem Enter)

Enter não existe entre as ferramentas. Selecione a célula (passo 1), escreva com `preencher` no
campo **"formula bar"** e clique no botão **"commit edit"** (o ✓ ao lado da barra) para gravar.
"cancel edit" descarta. Depois, leia a "formula bar" de novo para conferir o que ficou.

## 3. Perguntas sobre a planilha inteira

"Qual o total", "quem está atrasado", "resuma esta planilha": se houver o botão
"Chat com o Copilot", pergunte por lá antes de ler célula por célula.

## 4. Abas e navegação

- As planilhas da pasta aparecem como guias "Planilha …" na parte de baixo: clique para trocar.
- Fórmulas prontas: guia "Fórmulas" e botão "AutoSoma".

## 5. Gráficos e outros objetos desenhados

Gráfico, imagem e forma não aparecem em `ler_campos`: são desenho, como a grade.

1. `ver_tela` para achar o gráfico. A foto diz o próprio tamanho em pixels.
2. `clicar_ponto` na borda ou num canto vazio do gráfico (no meio, o clique pega uma barra ou a
   legenda, não o gráfico inteiro). Confira com `ver_tela`: gráfico selecionado ganha moldura.
3. **Apagar**: `teclar` Delete. Confira com `ver_tela` antes de ir para o próximo.
4. **Trocar o tipo**: com o gráfico selecionado aparece a guia "Gráfico"; chame `ler_campos` e
   clique no tipo ou em "Outros Gráficos" com `clicar`. Os botões da faixa têm ref: neles
   `clicar_ponto` é recusado.

Muitos gráficos para apagar ou mudar: é um por vez, e demora. Diga isso à pessoa antes de começar
e, se houver "Chat com o Copilot", prefira pedir a ele.

## 6. O que não fazer

- Não confie em número lido da foto quando o valor importa: confirme na "formula bar".
- Não apague nem sobrescreva célula sem a pessoa ter pedido.

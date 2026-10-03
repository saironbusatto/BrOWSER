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

## 5. O que não fazer

- Não confie em número lido da foto quando o valor importa: confirme na "formula bar".
- Não apague nem sobrescreva célula sem a pessoa ter pedido.

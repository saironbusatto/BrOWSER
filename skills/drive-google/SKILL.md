# Drive: buscar e perguntar antes de abrir arquivo

No Drive, procurar é o caminho normal. Abrir documento por documento é o último recurso: cada
arquivo custa uma leitura, e quem já indexou o conteúdo de tudo é a própria busca do Drive.

## 0. Busca pela API, se o Drive estiver conectado

Antes da tela: `buscar_no_drive` procura no **conteúdo** de todos os arquivos (nome, CPF, número de
contrato) e devolve os resultados com link. `ler_arquivo_drive` lê o texto de um Doc, Planilha ou
Apresentação sem abrir nada. Se elas responderem que o Drive não está conectado, siga pela tela.

## 1. A caixa de busca do Drive

- Escreva com `preencher` no campo "Buscar no Drive". O Drive filtra enquanto a pessoa digita:
  **Enter não existe entre as ferramentas e não é preciso** — leia os resultados com `ler_campos`.
- Operadores que funcionam na busca do Drive:
  - `"frase exata"` e `-palavra` (exclui)
  - `type:pdf`, `type:document`, `type:spreadsheet`, `type:folder`
  - `owner:me`, `starred:true`, `sharedwithme`, `trashed:false`
- Nome, CPF, CNPJ, número de contrato ou prazo vão direto na caixa, entre aspas quando forem frase.

## 2. "Perguntar ao Gemini" do Drive

Para "qual o CPF dessa pessoa", "quanto vale este contrato", "qual o prazo", a resposta está no
conteúdo dos arquivos: quem já leu tudo é o Gemini do próprio Drive. Abra o botão "Perguntar ao
Gemini" (ícone de faísca na barra superior) e faça a pergunta por lá, em vez de abrir arquivo
por arquivo atrás do dado.

## 3. Só então abra o arquivo

Se a busca e o Gemini não responderem: abra o resultado mais provável e leia com `ler_pagina`.
Um ou dois arquivos, não dez.

## 4. O que não fazer

- Não peça à pessoa para colar o que o Drive já responde (contrato, CPF, prazo, valor).
- Não abra nem baixe um arquivo só para descobrir se é o certo: título e trecho da busca já dizem.
- Não descarregue uma pasta inteira quando um filtro de busca resolve.
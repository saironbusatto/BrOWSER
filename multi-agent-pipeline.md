# Plano de Implementação: Pipeline Multiagente Concorrente & Suporte a Arquivos

## Objetivo
Implementar a arquitetura concorrente multiagente no bRowser, permitindo que enquanto um agente explora/mapeia o DOM no navegador (Scout), outro agente processe, extraia e sintetize os dados (Synthesizer) a partir de prompts, PDFs, XMLs ou imagens.

---

## Fases de Implementação

### Fase 1: Protocolo de Comunicação & Tipos (`packages/shared`)
- [ ] Adicionar tipo `ArquivoAnexo` (`nome`, `tipo`, `tamanho`, `conteudoTexto`, `dadosBase64`).
- [ ] Atualizar `Pedir` e `MensagemExtensao` para suportar `arquivos?: ArquivoAnexo[]`.
- [ ] Atualizar `EventoStatus` para suportar indicador de agente (`agente?: 'scout' | 'synthesizer' | 'geral'`).

### Fase 2: Interface do Painel Lateral (`packages/extension/entrypoints/sidepanel`)
- [ ] Adicionar botão de anexo (📎) e suporte a Drag & Drop de arquivos (`.pdf`, `.xml`, `.json`, `.csv`, `.txt`, `.png`, `.jpg`).
- [ ] Renderizar chips de pré-visualização de arquivos anexados com botão de remoção.
- [ ] Atualizar `main.ts` para ler arquivos locais (texto ou base64) e enviá-los no payload da requisição.
- [ ] Atualizar o stepper / HUD de status para exibir o progresso paralelo dos dois agentes em tempo real.

### Fase 3: Processador de Documentos na Ponte (`packages/bridge/src/documentos.ts`)
- [ ] Criar módulo utilitário para parsing e extração de dados estruturados de XML (ex.: NF-e / tags fiscais) e arquivos de texto.
- [ ] Estruturar o extrator para normalizar informações antes de alimentar o modelo.

### Fase 4: Orquestrador Concorrente Multiagente (`packages/bridge/src/pipeline.ts` e `ias.ts`)
- [ ] Implementar a divisão concorrente da tarefa:
  - **Worker Scout (Navegador)**: Executa varredura de campos, abertura de submenus/gavetas via CDP.
  - **Worker Synthesizer (Dados/Criação)**: Paralelamente extrai dados de arquivos ou cria prompts conceituais detalhados.
- [ ] Ponto de junção (*Join*): O despachador funde os dados estruturados com os seletores mapeados e executa o preenchimento instantâneo.
- [ ] Atualizar prompt do sistema para orientar a IA sobre o pipeline concorrente.

### Fase 5: Verificação e Testes
- [ ] Compilar packages (`extension`, `bridge`, `shared`).
- [ ] Testar no formulário local (`http://localhost:5173/`).
- [ ] Testar anexo de arquivo XML/TXT e conferir preenchimento simultâneo.

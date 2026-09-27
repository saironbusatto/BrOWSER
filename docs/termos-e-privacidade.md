# Termos de Serviço e Política Global de Privacidade do bRowser

**Última Atualização:** 27 de setembro de 2026  
**Versão:** 2.0.0 (Enterprise, Developer & Community Edition)  
**Status Jurídico:** Documento Vinculante e Vigente

---

## Preâmbulo e Aceitação dos Termos

O presente instrumento estabelece os **Termos de Serviço e a Política Global de Privacidade e Proteção de Dados** (doravante denominados conjuntamente como "Termos") aplicáveis ao uso do ecossistema de software **bRowser** — compreendendo a extensão para navegadores web baseados no motor Chromium/Firefox, o serviço ponte local (*Desktop Bridge*), os esquemas de telemetria passiva, os utilitários de linha de comando (CLI) e os protocolos de automação assistida por inteligência artificial (coletivamente referidos como o "Software" ou "Serviço").

AO INSTALAR, CARREGAR, EXECUTAR, COMPILAR OU DE QUALQUER FORMA UTILIZAR O BROWSER, VOCÊ ("USUÁRIO", "VOCÊ" OU "SUA EMPRESA") DECLARA TER LIDO, COMPREENDIDO E CONCORDADO INTEGRALMENTE COM TODOS OS TERMOS E CONDIÇÕES AQUI EXPOSTOS, BEM COMO COM AS OBRIGAÇÕES DECORRENTES DA LEGISLAÇÃO APLICÁVEL, INCLUINDO, SEM LIMITAÇÃO, O MARCO CIVIL DA INTERNET (LEI FEDERAL Nº 12.965/2014) E A LEI GERAL DE PROTEÇÃO DE DADOS PESSOAIS — LGPD (LEI FEDERAL Nº 13.709/2018), ALÉM DO REGULAMENTO GERAL SOBRE A PROTEÇÃO DE DADOS DA UNIÃO EUROPEIA (GDPR - REGULAMENTO UE 2016/679) QUANDO APLICÁVEL.

CASO NÃO CONCORDE COM QUALQUER DISPOSIÇÃO DESTES TERMOS, VOCÊ DEVE IMEDIATAMENTE CESSAR O USO DO BROWSER, DESINSTALAR A EXTENSÃO DO SEU NAVEGADOR E EXCLUIR OS ARQUIVOS EXECUTÁVEIS E DIRETÓRIOS DE DADOS LOCAIS DA SUA MÁQUINA.

---

## 1. Definições e Glossário Técnico-Jurídico

Para os fins destes Termos, os seguintes termos em maiúsculas ou itálico terão os significados a eles atribuídos abaixo:

* **"bRowser":** O conjunto de programas de computador composto por uma extensão de navegador (Client Side Panel) e uma aplicação servidora local (Desktop Bridge) que opera via protocolo Model Context Protocol (MCP) e WebSockets autenticados.
* **"Desktop Bridge" (Ponte Local):** O processo binário ou script que executa localmente no sistema operacional do Usuário (Linux, Windows ou macOS), encarregado de intermediar comandos entre a extensão web e as ferramentas de IA instaladas no dispositivo.
* **"Provedor Terceirizado de IA" (LLM Provider):** As empresas detentoras de modelos de inteligência artificial de ponta, incluindo, mas não se limitando a: **Google LLC** (Google AI Pro, Gemini Ultra/Advanced), **OpenAI OpCo, LLC** (ChatGPT Plus, ChatGPT Pro, Codex) e **Anthropic, PBC** (Claude Pro, Claude Enterprise).
* **"BYOS" (Bring Your Own Subscription):** O modelo arquitetural adotado pelo bRowser, segundo o qual o Usuário utiliza seus próprios planos de assinatura já contratados diretamente perante os Provedores Terceirizados de IA, sem a necessidade de chaves de API pagas por token nem a intermediação financeira do bRowser.
* **"Blueprint" (Mapa Estrutural de Site):** Estrutura de dados serializada em JSON/TypeScript contendo estritamente a topologia hierárquica e semântica de elementos interativos do Document Object Model (DOM) de páginas da web (tais como botões, formulários públicos, rótulos ARIA, atributos W3C), desprovida de quaisquer dados pessoais preenchidos.
* **"Telemetria Passiva de Formulários":** Mecanismo de escuta estritamente estrutural implementado pelo script de conteúdo da extensão que observa eventos nativos de autofill do navegador ou mudanças estruturais do DOM para catalogar campos pré-existentes em páginas web públicas e privadas, sem jamais interceptar o valor digitado.
* **"Zero PII" (Zero Personally Identifiable Information):** Princípio inviolável de concepção de software (*Privacy by Design*) que veda categoricamente a extração, armazenamento ou transmissão de qualquer dado capaz de identificar, direta ou indiretamente, uma pessoa natural física.
* **"Human-in-the-Loop" (Intervenção Humana Obrigatória):** Paradigma técnico de segurança que impede a automação irreversível de formulários, condicionando qualquer transmissão definitiva de dados à verificação visual e clique manual consciente por parte do Usuário humano.
* **"Dados do Usuário":** Informações de documentos locais (como notas fiscais XML, arquivos PDF, planilhas) e instruções textuais fornecidas voluntariamente pelo Usuário no campo de chat do bRowser para execução da tarefa pretendida.

---

## 2. Arquitetura Operacional e Modelo de Assinatura Direta ("BYOS")

### 2.1. Princípio de Ausência de Intermediação de Tokens e Credenciais de API
O bRowser foi desenhado para eliminar a dependência de créditos avulsos de desenvolvedor e chaves privadas de API (`API Keys`). O Usuário reconhece que:
1. O bRowser **não vende, não revende e não monetiza** tokens de inferência de inteligência artificial;
2. O bRowser **não atua como proxy centralizado**, de modo que as requisições de IA partem exclusivamente da máquina local do Usuário através de ferramentas e sessões oficiais;
3. O Usuário é o titular soberano de suas assinaturas de consumo ou profissionais junto aos respectivos Provedores de IA (ex.: Google Workspace / One AI Premium, ChatGPT Plus / Pro, Anthropic Claude Pro).

### 2.2. Autenticação Oficial e Não-Retenção de Senhas
1. Qualquer processo de autenticação perante os Provedores de IA é conduzido de forma canônica, direta e transparente, por meio das interfaces de login e fluxos autorizados mantidos pelas respectivas empresas em seus portais e ferramentas oficiais;
2. O bRowser **NUNCA solicita, intercepta, captura, descriptografa ou armazena senhas mestras, códigos de segundo fator (2FA/MFA), cookies de sessão privada ou dados de cartão de crédito** do Usuário vinculados aos Provedores de IA;
3. O tráfego entre a extensão do navegador e a ponte desktop é protegido por tokens de autorização criptográficos locais (gerados em tempo de execução e armazenados em memória volátil) via Bearer Token sobre loopback local (`localhost` ou `127.0.0.1`), sem exposição à rede externa ou a terceiros.

### 2.3. Cumprimento dos Termos dos Provedores Terceirizados
O Usuário compromete-se a utilizar o bRowser em estrita conformidade com os Termos de Uso, Políticas de Uso Comercial e Códigos de Conduta dos Provedores Terceirizados dos quais é assinante. O bRowser opera como uma interface cliente assistida no ambiente do próprio Usuário, não empregando mecanismos de engenharia reversa ilícita, burla de *rate limits* ou quebra de restrições de segurança impostas pelos Provedores de IA.

---

## 3. Política Global de Privacidade e Tratamento de Dados (LGPD e GDPR)

O bRowser adota os princípios de *Privacy by Design* (Privacidade desde a Concepção) e *Privacy by Default* (Privacidade por Padrão), respeitando integralmente as balizas da Lei Geral de Proteção de Dados Pessoais brasileira (Lei nº 13.709/2018 - "LGPD") e do Regulamento Geral de Proteção de Dados da União Europeia (Regulamento UE 2016/679 - "GDPR").

### 3.1. Papéis das Partes no Tratamento de Dados
* **O Usuário como Controlador de Dados (Data Controller):** O Usuário é o único controlador sobre quais páginas web visita, quais documentos locais decide abrir e quais instruções confia ao modelo de inteligência artificial;
* **Natureza Local do Software (Local Client Execution):** O bRowser é um software cliente que opera na infraestrutura privada do Usuário (em seu computador pessoal ou corporativo). O desenvolvedor do bRowser **não opera servidores centrais de armazenamento de mensagens de chat, não monitora a navegação do Usuário e não mantém bancos de dados na nuvem contendo o histórico de interações do Usuário**.

### 3.2. Hipóteses Legais de Tratamento (Art. 7º da LGPD)
O funcionamento técnico do bRowser ampara-se nas seguintes bases legais:
1. **Execução de Contrato e Procedimentos Preliminares (Art. 7º, V, LGPD):** Para viabilizar a automação local de tarefas comandadas pelo Usuário;
2. **Legítimo Interesse (Art. 7º, IX, LGPD):** Para a geração de Blueprints estritamente estruturais e anônimos voltados à otimização e estabilidade das automações em páginas web públicas, com garantia comprovada de ausência de impacto nos direitos e liberdades individuais do titular;
3. **Consentimento Explícito (Art. 7º, I, LGPD):** Manifestado mediante a instalação do software e adesão aos presentes Termos para a integração com serviços terceiros de IA escolhidos pelo Usuário.

---

## 4. Garantia Técnica Absoluta de "Zero PII" (Zero Dados Pessoais)

O bRowser incorpora salvaguardas algorítmicas rigorosas destinadas a impedir a fuga, indexação ou vazamento involuntário de dados pessoais identificáveis.

### 4.1. O que é Catalogado pelo Sistema de Telemetria e Blueprints
A catalogação de páginas da web destina-se exclusivamente a criar mapas estruturais (Blueprints) para que o agente saiba localizar caixas de texto e botões. São coletados e compartilhados unicamente:
* Metadados topológicos públicos do DOM (tais como tags `<input>`, `<button>`, `<select>`, `<form>`);
* Atributos W3C e HTML padronizados (ex.: `type="text"`, `type="email"`, `autocomplete="shipping postal-code"`, `name="cidade"`, `aria-label="Pesquisar"`);
* Textos de rótulos genéricos públicos de formulários (ex.: *"Razão Social"*, *"Inscrição Estadual"*, *"CEP"*, *"Endereço de Entrega"*);
* Seletores relativos para localização de botões de navegação (ex.: *"Avançar"*, *"Filtrar"*, *"Consultar"*).

### 4.2. O que é ESTRITAMENTE VEDADO e NUNCA Coletado ou Transmitido
O bRowser possui filtros de sanitização ativos no código-fonte que bloqueiam:
1. **Valores Digitados pelo Usuário (`input.value` e `textarea.value`):** Nenhum valor preenchido em tempo de execução, seja digitado manualmente ou populado por autofill, é incluído em relatórios ou Blueprints compartilhados;
2. **Credenciais e Segredos:** É vedada a leitura de campos `type="password"`, chaves criptográficas, assinaturas digitais, certificados locais e tokens anti-CSRF;
3. **Dados Financeiros e de Pagamento:** É vedada a captura de números de cartões de pagamento (PAN), códigos de segurança (CVV/CVC), senhas bancárias ou chaves PIX de uso pessoal;
4. **Dados Pessoais Sensíveis (Art. 5º, II da LGPD):** Nenhuma informação relativa a origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico é extraída para fins de blueprints;
5. **Sanitização de URLs e Parâmetros de Navegação:** Qualquer endereço de página analisado passa por expurgo automatizado obrigatório na origem, descartando imediatamente parâmetros de consulta (*query parameters*, ex.: `?token=...`, `?auth=...`, `?user_id=...`, `?session=...`), mantendo apenas a rota canônica e estrutural do domínio.

---

## 5. Sistema Comunitário de Blueprints (Memória Coletiva)

### 5.1. Natureza Anônima e Finalidade Comunitária
O repositório de Blueprints do bRowser funciona como uma base compartilhada de conhecimento de layouts web para permitir que rotinas burocráticas (como portais de prefeituras, sistemas ERP em nuvem, consultas públicas governamentais e formulários fiscais) sejam reconhecidas de forma imediata e econômica por qualquer usuário do software.

### 5.2. Anonimização Irreversível (Art. 12 da LGPD)
Nos termos do Art. 12 da LGPD e do Considerando 26 da GDPR, os dados anonimizados não são considerados dados pessoais para os fins da lei. Como os Blueprints registram unicamente a anatomia estática do HTML sem vinculação a identificadores de sessão, endereços IP de usuários ou valores de formulários, o Usuário concorda que os referidos arquivos de mapeamento estrutural não possuem natureza de dado pessoal.

### 5.3. Licença de Contribuição de Metadados
Ao habilitar e utilizar o bRowser, o Usuário concede ao projeto bRowser e à sua comunidade uma licença perpétua, mundial, irrevogável, não-exclusiva e livre de royalties para hospedar, distribuir, indexar, modificar e disponibilizar publicamente os Blueprints anônimos gerados em repositórios abertos (como GitHub e CDN distribuída).

### 5.4. Controle Local e Limpeza de Cache
O Usuário possui a prerrogativa e a capacidade técnica de, a qualquer momento:
1. Desativar a sincronização de blueprints nas configurações do software;
2. Auditar, inspecionar e deletar manualmente todo e qualquer blueprint ou arquivo de cache armazenado localmente em seu disco rígido nos diretórios canônicos:
   * **Linux / macOS:** `~/.config/browser-bridge/`
   * **Windows:** `%LOCALAPPDATA%\bRowser\`

---

## 6. Processamento Local de Documentos e Segurança de Arquivos

### 6.1. Processamento em Memória Volátil (In-Memory Processing)
Quando o Usuário anexa documentos ao painel do bRowser — tais como arquivos XML de Nota Fiscal Eletrônica (NF-e/NFC-e), arquivos JSON/CSV, demonstrativos em PDF ou imagens de comprovantes — o processamento de leitura, extração de tabelas e serialização ocorre **exclusivamente na memória RAM da máquina local do Usuário**, por meio das bibliotecas embutidas na ponte desktop.

### 6.2. Ausência de Servidores em Nuvem Intermediários
O bRowser **não realiza upload de documentos do Usuário para servidores em nuvem próprios ou centrais de processamento**. Os dados extraídos dos documentos são convertidos em texto contextual e transmitidos estritamente ao processo do Provedor de IA autenticado e selecionado pelo Usuário na sessão corrente.

### 6.3. Descarte Efêmero de Arquivos Temporários
Quaisquer arquivos auxiliares criados temporariamente para a viabilização de chamadas do sistema operacional são mantidos com permissões restritivas (modo `0700` ou `0600`) em diretórios temporários do sistema operacional (`tmpdir`), sendo imediatamente destruídos e sobrescritos ao término da execução do comando.

---

## 7. Princípio Human-in-the-Loop e Parada Obrigatória Pré-Submissão

### 7.1. Cláusula de Bloqueio de Ações Finais Irrevogáveis
Como salvaguarda essencial contra prejuízos patrimoniais, operacionais ou jurídicos:
1. O BROWSER É EXPRESSAMENTE CONFIGURADO E CODIFICADO PARA **NÃO EXECUTAR CLIQUES AUTÔNOMOS EM BOTÕES DE ENVIO FINAL OU TRANSMISSÃO IRREVOGÁVEL DE DADOS** (TAIS COMO: *"SUBMIT"*, *"ENVIAR"*, *"CONFIRMAR PAGAMENTO"*, *"TRANSMITIR NOTA FISCAL"*, *"FINALIZAR PEDIDO"* OU SIMILARES);
2. A inteligência artificial auxilia no preenchimento de campos de texto, caixas de seleção e botões de etapas intermediárias de formulários com base nas instruções do Usuário, mas **obrigatoriamente encerra sua rotina antes da submissão final**, solicitando a verificação manual na interface.

### 7.2. Dever Indispensável de Verificação Humana
O USUÁRIO É O ÚNICO E EXCLUSIVO RESPONSÁVEL POR REVISAR E AUDITAR VISUALMENTE TODOS OS VALORES, DATAS, ALÍQUOTAS, NOMES, DESTINATÁRIOS E DADOS NUMÉRICOS INSERIDOS PELA IA ANTES DE DECIDIR, POR ATO PRÓPRIO E HUMANO, CLICAR NO BOTÃO DE ENVIO OU PROTOCOLO.

### 7.3. Interrupção Instantânea e Soberania do Usuário
O Usuário mantém soberania total sobre sua máquina a todo momento. O Usuário pode, a qualquer fração de segundo:
1. Clicar no botão de parada ("Stop" / Cancelar) na interface do painel lateral;
2. Fechar a aba ou janela do navegador;
3. Interromper o processo da ponte desktop via terminal ou gerenciador de tarefas;
4. Digitar sobre ou corrigir manualmente qualquer campo que o modelo de IA tenha preenchido incorretamente.

---

## 8. Propriedade Intelectual, Entradas (Inputs) e Saídas (Outputs)

### 8.1. Propriedade dos Dados de Entrada (Inputs)
O Usuário mantém todos os direitos de propriedade intelectual, titularidade e domínio sobre os documentos, textos, comandos e arquivos que carregar ou submeter através do bRowser ("Inputs"). O bRowser não reivindica quaisquer direitos de propriedade sobre tais materiais.

### 8.2. Direitos sobre os Resultados e Saídas (Outputs)
No limite permitido pela legislação aplicável e de acordo com os termos contratuais do Provedor de IA correspondente contratado pelo Usuário, o Usuário é o titular de todos os direitos patrimoniais sobre o conteúdo e as respostas geradas pela IA ("Outputs").

### 8.3. Propriedade Intelectual do Software bRowser
O código-fonte, a arquitetura de software, as marcas, logotipos, documentações, interfaces gráficas e esquemas de automação pertencentes ao projeto bRowser são protegidos pela legislação de direitos autorais e propriedade intelectual (Lei Federal nº 9.609/1998 e Lei Federal nº 9.610/1998). O Usuário tem direito de uso estritamente dentro dos limites da licença de código sob a qual o projeto é formalmente distribuído.

---

## 9. Política de Uso Aceitável (AUP - Acceptable Use Policy)

O Usuário concorda expressamente em utilizar o bRowser unicamente para finalidades lícitas e éticas. É estritamente vedado ao Usuário utilizar o Software para:

1. **Atividades Ilícitas ou Criminosas:** Praticar ou tentar praticar fraudes eletrônicas, invasão de dispositivo informático (Art. 154-A do Código Penal brasileiro), estelionato, lavagem de capitais ou violação de segredos industriais e comerciais;
2. **Ataques Cibernéticos e Abuso de Redes:** Realizar ataques de negação de serviço (DoS/DDoS), injeção de código malicioso (*cross-site scripting*, injeção de SQL), exploração automatizada de vulnerabilidades ou manipulação indevida de infraestruturas governamentais ou privadas;
3. **Bypass Malicioso de Salvaguardas:** Modificar ou adulterar o código-fonte do bRowser com a finalidade expressa de desativar as travas de *Zero PII*, reativar cliques autônomos sem supervisão em botões de pagamento/envio, ou burlar mecanismos de consentimento;
4. **Spamming e Inundação de Formulários:** Disparar preenchimentos massivos, não solicitados ou automatizados com o intuito de causar sobrecarga, poluição de bases de dados alheias ou envio de comunicações fraudulentas (phishing);
5. **Violação de Direitos de Terceiros:** Violar direitos autorais, patentes, marcas registradas ou direitos fundamentais de privacidade e honra de terceiros;
6. **Burla de Credenciais:** Tentar contornar limites contratuais ou mecanismos de segurança dos Provedores Terceirizados de IA aos quais o Usuário não possua legitimidade de acesso.

O descumprimento de qualquer item desta Seção constituirá rescisão imediata e automática do direito de uso do bRowser, sujeitando o infrator às sanções cíveis e criminais aplicáveis.

---

## 10. Isenção de Garantias ("AS IS") e Limitação de Responsabilidade

### 10.1. Fornecimento no Estado em que se Encontra ("AS IS" e "AS AVAILABLE")
O SOFTWARE É FORNECIDO "NO ESTADO EM QUE SE ENCONTRA" E "CONFORME DISPONÍVEL", COM TODAS AS SUAS FALHAS EVENTUAIS E SEM GARANTIAS DE QUALQUER NATUREZA, SEJAM EXPRESSAS, IMPLÍCITAS, ESTATUTÁRIAS OU DECORRENTES DE USOS COMERCIAIS. OS DESENVOLVEDORES, MANTENEDORES E COLABORADORES DO BROWSER RENUNCIAM EXPRESSAMENTE A QUAISQUER GARANTIAS IMPLÍCITAS DE COMERCIABILIDADE, ADEQUAÇÃO A UMA FINALIDADE ESPECÍFICA, NÃO-VIOLAÇÃO, OPERAÇÃO ININTERRUPTA OU LIVRE DE ERROS.

### 10.2. Reconhecimento da Natureza Estocástica dos Modelos de IA
O USUÁRIO RECONHECE EXPRESSAMENTE QUE MODELOS DE LINGUAGEM DE GRANDE PORTE (LLMS) E SISTEMAS DE INTELIGÊNCIA ARTIFICIAL:
1. OPERAM COM BASE EM PROBABILIDADES ESTATÍSTICAS, ESTANDO SUJEITOS A "ALUCINAÇÕES", ERROS FACTUAIS, INCOMPREENSÃO DE CONTEXTO E FORMATAÇÕES EQUIVOCADAS DE DADOS;
2. PODEM SELECIONAR OU CLICAR EM ELEMENTOS INCORRETOS DO NAVEGADOR WEB SE A ESTRUTURA DO SITE ALVO TIVER SIDO ALTERADA OU POSSUIR CÓDIGO COMPLEXO/DINÂMICO;
3. NÃO SUBSTITUEM O JULGAMENTO CRÍTICO E A EXPERTISE PROFISSIONAL DE SERES HUMANOS (CONTADORES, ADVOGADOS, ENGENHEIROS, AUDITORES, GESTORES FINANCEIROS, ETC.).

### 10.3. Limitação Geral de Danos
NA MÁXIMA EXTENSÃO PERMITIDA PELA LEI APLICÁVEL, EM NENHUM CASO OS CRIADORES, AUTORES, DISTRIBUIDORES OU CONTRIBUIDORES DO BROWSER SERÃO RESPONSÁVEIS PERANTE O USUÁRIO OU QUALQUER TERCEIRO POR:
* LUCROS CESSANTES, PERDAS DE OPORTUNIDADES COMERCIAIS, INTERRUPÇÃO DE NEGÓCIOS OU PERDA DE RECEITA;
* MULTAS FISCAIS, TRIBUTÁRIAS, ADMINISTRATIVAS OU ADUANEIRAS DECORRENTES DE PREENCHIMENTO INCORRETO DE DECLARAÇÕES OU NOTAS FISCAIS;
* PAGAMENTOS REALIZADOS INDEVIDAMENTE EM SITES DE BANCOS OU MEIOS DE PAGAMENTO;
* CORRUPÇÃO OU PERDA DE DADOS, ARQUIVOS OU INFORMAÇÕES DO SISTEMA OPERACIONAL;
* QUAISQUER DANOS INDIRETOS, INCIDENTAIS, ESPECIAIS, PUNITIVOS OU CONSEQUENCIAIS,
QUALQUER QUE SEJA A TEORIA DE RESPONSABILIDADE (CONTRATO, ILÍCITO CIVIL, NEGLIGÊNCIA OU OUTRA), MESMO QUE ADVERTIDOS DA POSSIBILIDADE DE TAIS DANOS.

CASO QUALQUER JURISDIÇÃO NÃO PERMITA A EXCLUSÃO INTEGRAL DE RESPONSABILIDADE, A RESPONSABILIDADE TOTAL CUMULADA DOS CRIADORES DO BROWSER FICARÁ ESTRITAMENTE LIMITADA AO VALOR EFETIVAMENTE PAGO PELO USUÁRIO AOS DESENVOLVEDORES DIRETOS DO SOFTWARE PELO USO DO BROWSER NOS ÚLTIMOS 12 (DOZE) MESES ANTERIORES AO EVENTO DANOSO OU AO VALOR DE R$ 100,00 (CEM REAIS BRASILEIROS), O QUE FOR MENOR.

---

## 11. Indenização

O Usuário concorda em defender, indenizar e manter indenes o projeto bRowser, seus mantenedores, autores, colaboradores e licenciantes contra todas e quaisquer reivindicações, processos judiciais, investigações, demandas, danos, perdas, penalidades, multas, custas e despesas (incluindo honorários advocatícios razoáveis) decorrentes de ou relacionados a:
1. Violação destes Termos ou da Política de Privacidade pelo Usuário;
2. Utilização indevida, abusiva ou ilegal do Software;
3. Violação de direitos de propriedade intelectual ou de privacidade de terceiros;
4. Dados ou documentos carregados pelo Usuário através do Software;
5. Quaisquer atos, omissões ou transações executadas pelo Usuário em sítios web de terceiros por meio da automação do navegador.

---

## 12. Encerramento de Uso e Desinstalação (Rescisão)

### 12.1. Rescisão por Vontade do Usuário
O Usuário pode rescindir este contrato a qualquer tempo e sem aviso prévio, bastando desinstalar a extensão do navegador de internet, encerrar a execução do binário da ponte desktop e apagar os diretórios locais de configuração.

### 12.2. Rescisão por Descumprimento
O direito do Usuário de utilizar o Software será rescindido imediatamente e sem necessidade de notificação judicial ou extrajudicial caso o Usuário descumpra qualquer uma das disposições materiais destes Termos.

### 12.3. Sobrevivência de Cláusulas
As disposições que, por sua natureza substancial, devam sobreviver ao término do uso — incluindo expressamente as cláusulas de **Propriedade Intelectual**, **Garantia de Zero PII em Blueprints Coletados**, **Isenção de Garantias**, **Limitação de Responsabilidade**, **Indenização** e **Legislação Aplicável e Foro** — permanecerão plenamente vigentes e vinculantes após qualquer rescisão.

---

## 13. Modificações dos Termos e Atualizações

Os mantenedores do bRowser reservam-se o direito de atualizar, revisar ou modificar os presentes Termos a qualquer tempo, com o objetivo de refletir melhorias no Software, incorporar novas salvaguardas de segurança ou atender a alterações legislativas e regulatórias.

* As versões atualizadas serão publicadas no repositório oficial do projeto com a indicação da data de "Última Atualização" no topo deste documento;
* Versões com modificações substanciais serão comunicadas através de notas de versão (*release notes*) ou notificações na interface gráfica do painel lateral;
* O uso continuado do bRowser após a data de publicação dos Termos revisados constitui aceitação plena e irretratável das novas condições.

---

## 14. Disposições Gerais

1. **Integralidade do Acordo:** Estes Termos constituem o acordo integral entre o Usuário e os mantenedores do bRowser no que diz respeito ao objeto aqui tratado, substituindo todos os acordos, conversas ou entendimentos prévios, verbais ou escritos;
2. **Independência das Disposições (Divisibilidade):** Se qualquer disposição destes Termos for considerada inválida, ilegal ou inexequível por um tribunal competente, as demais cláusulas permanecerão em pleno vigor e efeito;
3. **Não-Renúncia:** A renúncia ou tolerância em relação a qualquer inadimplemento ou descumprimento destes Termos não constituirá novação nem renúncia a direitos perante infrações futuras semelhantes ou diversas;
4. **Cessão:** O Usuário não poderá ceder ou transferir seus direitos e obrigações decorrentes destes Termos sem o consentimento prévio por escrito. Os mantenedores do projeto poderão ceder seus direitos livremente a sucessores legais no caso de reestruturação do projeto.

---

## 15. Legislação Aplicável e Foro de Eleição

Estes Termos são regidos e interpretados de acordo com as leis substantivas da **República Federativa do Brasil**, com atenção primordial ao Marco Civil da Internet (Lei nº 12.965/2014), à Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018) e ao Código de Processo Civil.

Fica eleito o Foro da Comarca de Curitiba, Estado do Paraná, com exclusão de qualquer outro, por mais privilegiado que seja, para dirimir quaisquer disputas, controvérsias ou ações decorrentes do presente instrumento, renunciando expressamente as partes a qualquer outra competência territorial ou internacional.

---

*Fim dos Termos de Serviço e Política de Privacidade do bRowser.*

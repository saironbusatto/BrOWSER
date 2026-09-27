export type AcaoGatilho = {
  descricao: string;
  seletorOuNome: string;
  tipo: 'click' | 'focus';
  esperarMilissegundos?: number;
};

export type CampoBlueprint = {
  idSemantico: string; // ex: 'cnpj_emitente', 'razao_social', 'email', 'telefone', 'prompt_input'
  rotulo: string; // nome amigável ou label
  papel: string; // role ARIA (textbox, combobox, button, etc.)
  seletorAcessivel: string; // nome acessível do nó ou identificador
  tipoEsperado?: string; // 'cnpj' | 'cpf' | 'email' | 'telefone' | 'data' | 'texto' | 'moeda'
  obrigatorio?: boolean;
  opcoes?: string[]; // para selects/comboboxes
};

export type SiteBlueprint = {
  $schema?: string;
  dominio: string; // ex: 'gemini.google.com' ou 'localhost:5173'
  urlPattern?: string; // regex ou padrão de URL
  versao: string; // semver (ex: '1.0.0')
  titulo: string;
  atualizadoEm: string; // ISO 8601
  gatilhos?: AcaoGatilho[];
  campos: CampoBlueprint[];
};

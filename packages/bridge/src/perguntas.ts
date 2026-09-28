// Filtro das perguntas que a IA faz ao usuário (ferramenta perguntar_ao_usuario).
// O usuário não pode receber "teste", "ok" ou "?": se a pergunta não se sustenta sozinha,
// ela volta para a IA reescrever e o cartão nem aparece no painel.

const MIN_CARACTERES = 15;
const MIN_PALAVRAS = 3;

export type Pergunta = { pergunta: string; campos?: string[]; opcoes?: string[] };

/** Motivo da recusa (para devolver à IA), ou null se a pergunta pode ir para o usuário. */
export function motivoPerguntaVaga({ pergunta }: Pergunta): string | null {
  const texto = pergunta.replace(/\s+/g, ' ').trim();
  const palavras = texto.split(' ').filter((p) => /\p{L}{2,}/u.test(p));
  if (texto.length >= MIN_CARACTERES && palavras.length >= MIN_PALAVRAS) return null;
  return (
    `Pergunta recusada e NÃO mostrada ao usuário ("${texto}" é vaga demais). ` +
    'Reescreva como uma pergunta completa que ele entenda sem contexto: diga qual campo da página ' +
    'precisa do dado, por que você não o tem e, se houver, as opções (use o parâmetro "opcoes"). ' +
    'Exemplo: "Qual opção escolher em \'Primary Discovery Channel\' (como você conheceu a SignPath)?"'
  );
}

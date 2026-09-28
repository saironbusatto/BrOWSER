// Marca de build.
//
// `bun build --compile` aceita `--define`, que troca a expressão por uma constante no binário.
// `scripts/build.ts` injeta `BROWSE_DEV=true` no build de desenvolvimento; no release a marca não
// existe e as rotas de teste ficam inalcançáveis (o compilador não remove a string "/control" do
// executável, mas o ramo nunca é tomado — o que `scripts/check-control.ts` prova por comportamento,
//   com um token válido e BROWSE_DEV=1 no ambiente).
//
// IMPORTANTE: só vale o valor de compilação. Não há fallback para variável de ambiente de propósito
// — com um fallback, bastaria `BROWSE_DEV=1` no ambiente para religar /control num binário de
// release, e a garantia "o executável do usuário não tem a rota" viria mentira.
//
// A consequência é que rodar a ponte a partir do fonte (`bun src/main.ts`) não habilita /control:
// para usar o `bun run spike`, compila antes com `bun run build:dev` (que é o que o CI faz).
declare const BROWSE_DEV: boolean | undefined;

// O `typeof` é obrigatório, não defensivo: `declare const` some na compilação, então sem o typeof
// um binário de release faz referência a um identificador inexistente e MORRE ao subir (e como o
// build passa, o erro só aparece na primeira execução).
export const CONTROLE_ATIVO: boolean = typeof BROWSE_DEV !== 'undefined' && BROWSE_DEV === true;

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_NAME } from '@browser/shared';
import { type Diagnostico, diagnosticar, juntar, navegadorInstalado, relatorio } from '../src/doctor';
import { pastasDeNavegador } from '../src/instalar';

// O `--doctor` responde a pergunta "isso funciona na minha máquina?". Se ele errar, a pessoa
// recebe uma resposta falsa e perde a hora errando. Estes testes existem para travar os casos em
// que ele mentia: dizer que a ponte está pronta quando o executável sumiu, e dizer que um
// navegador está instalado quando o instalador é que criou a pasta dele.

const RAIZ = join(import.meta.dir, 'doctor-falso');

/**
 * Home falso por parâmetro, e não trocando `$HOME`: o `os.homedir()` do Bun ignora a variável
 * depois que o processo subiu, então um teste que a mutasse estaria olhando a máquina de quem
 * rodou o teste — e passando por engano.
 */
function usarHomeFalso(): string {
  rmSync(RAIZ, { recursive: true, force: true });
  mkdirSync(RAIZ, { recursive: true });
  return RAIZ;
}

function escreverManifesto(navegador: string, caminho: string): void {
  const pasta = pastasDeNavegador(HOME).find(([nome]) => nome === navegador)?.[1];
  if (!pasta) throw new Error(`navegador desconhecido no teste: ${navegador}`);
  const dir = join(pasta, 'NativeMessagingHosts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${HOST_NAME}.json`), JSON.stringify({ name: HOST_NAME, path: caminho, type: 'stdio' }));
}

let HOME: string;

beforeEach(() => {
  HOME = usarHomeFalso();
});

afterEach(() => {
  rmSync(RAIZ, { recursive: true, force: true });
});

describe('diagnosticar: registro da ponte', () => {
  it('diz que não está registrado em máquina sem registro', () => {
    const d = diagnosticar(HOME);
    expect(d.extensaoRegistrada).toBe(false);
    expect(d.navegador.every((n) => !n.registrado)).toBe(true);
  });

  it('diz que está registrado quando o navegador tem manifesto', () => {
    const exe = join(HOME, 'bin', 'bridge');
    mkdirSync(join(HOME, 'bin'), { recursive: true });
    writeFileSync(exe, '');
    escreverManifesto('Chrome', exe);

    const d = diagnosticar(HOME);
    expect(d.extensaoRegistrada).toBe(true);
    expect(d.navegador.find((n) => n.nome === 'Chrome')?.caminhoOk).toBe(true);
  });

  // Este é o caso que mais enganava: o registro continua no navegador, mas o executável foi
  // embora (repositório apagado, pasta movida, home trocada). A extensão só reclamaria
  // "Ponte não conectada", sem dizer o motivo. O doctor precisa dizer que está QUEBRADO, não
  // apenas ausente.
  it('distingue registro válido de registro apontando para executável que sumiu', () => {
    escreverManifesto('Chrome', join(HOME, 'bin', 'bridge-que-foi-apagado'));

    const d = diagnosticar(HOME);
    const chrome = d.navegador.find((n) => n.nome === 'Chrome');
    expect(chrome?.registrado).toBe(true);
    expect(chrome?.caminhoOk).toBe(false);
  });

  it('trata manifesto corrompido como ausente, sem quebrar', () => {
    const pasta = pastasDeNavegador(HOME).find(([nome]) => nome === 'Chrome')?.[1];
    if (!pasta) throw new Error('Chrome não está na lista de navegadores');
    const dir = join(pasta, 'NativeMessagingHosts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${HOST_NAME}.json`), '{ isto não é json');

    expect(() => diagnosticar()).not.toThrow();
    expect(diagnosticar(HOME).navegador.find((n) => n.nome === 'Chrome')?.caminhoOk).toBe(false);
  });
});

describe('navegadorInstalado: cada navegador no seu lugar', () => {
  // Ambiente falso: só existe o Chrome. Uma lista de caminhos compartilhada entre navegadores
  // diria que Edge, Vivaldi e Opera também estão instalados em qualquer máquina com Chrome — e a
  // pessoa perderia a instalação inteiro antes de ver o navegador.
  const soChrome = { which: (exe: string) => (exe.includes('chrome') ? '/usr/bin/google-chrome' : null), existe: () => false };

  it('reconhece o navegador que existe', () => {
    expect(navegadorInstalado('Chrome', soChrome)).toBe(true);
  });

  it('não inventa os navegadores que não existem', () => {
    for (const ausente of ['Brave', 'Edge', 'Chromium', 'Vivaldi', 'Opera']) {
      expect(navegadorInstalado(ausente, soChrome)).toBe(false);
    }
  });

  it('não confunde um navegador com outro', () => {
    const soEdge = { which: (exe: string) => (exe.includes('edge') ? '/opt/microsoft/msedge/msedge' : null), existe: () => false };
    expect(navegadorInstalado('Edge', soEdge)).toBe(true);
    expect(navegadorInstalado('Chrome', soEdge)).toBe(false);
    expect(navegadorInstalado('Brave', soEdge)).toBe(false);
  });

  it('acha o navegador em caminho fixo, mesmo fora do PATH', () => {
    const semPath = { which: () => null, existe: (c: string) => c === '/opt/vivaldi/vivaldi' };
    expect(navegadorInstalado('Vivaldi', semPath)).toBe(true);
    expect(navegadorInstalado('Opera', semPath)).toBe(false);
  });

  // A versão deste bug que mais mentia: uma lista de caminhos fixos compartilhada. O Chrome em
  // /opt fez o doctor listar Edge, Vivaldi e Opera como instalados, e a pessoa foi atrás de um
  // navegador que a máquina nunca teve.
  it('Chrome em caminho fixo não faz os outros parecerem instalados', () => {
    const chromeForaDoPath = { which: () => null, existe: (c: string) => c === '/opt/google/chrome/chrome' };
    expect(navegadorInstalado('Chrome', chromeForaDoPath)).toBe(true);
    for (const outro of ['Brave', 'Edge', 'Chromium', 'Vivaldi', 'Opera']) {
      expect(navegadorInstalado(outro, chromeForaDoPath)).toBe(false);
    }
  });

  it('devolve falso para um navegador que não conhece', () => {
    expect(navegadorInstalado('Netscape', soChrome)).toBe(false);
  });
});

describe('juntar: o veredito final', () => {
  const base = () => ({ ...diagnosticar(HOME), ias: [] as never[] });

  it('não fica pronto sem nenhuma ferramenta de IA instalada', () => {
    const d = juntar(base(), [
      { ia: 'agy' as const, instalado: false, conectado: false },
      { ia: 'codex' as const, instalado: false, conectado: false },
    ]);
    expect(d.pronto).toBe(false);
    expect(d.temComoConectar).toBe(false);
  });

  it('dá para conectar quando há ferramenta instalada e logada', () => {
    const d = juntar(base(), [
      { ia: 'agy' as const, instalado: false, conectado: false },
      { ia: 'codex' as const, instalado: true, conectado: true },
    ]);
    expect(d.pronto).toBe(true);
    expect(d.temComoConectar).toBe(true);
  });

  // Caso intermediário: a ferramenta existe mas falta o login. Não é erro, é o passo seguinte —
  // por isso os dois campos são separados.
  it('separa "instalada sem login" de "não instalada"', () => {
    const d = juntar(base(), [{ ia: 'claude' as const, instalado: true, conectado: false }]);
    expect(d.pronto).toBe(false);
    expect(d.temComoConectar).toBe(true);
  });

  // O login do Google AI Pro abre um terminal interativo (pty) e depende de python3. Sem isso a
  // pessoa descobre do nada, na hora do login, que falta dependência.
  // Nem esta linha pode perguntar "a máquina que roda o teste tem python3?": o CI do Windows não
  // tem, o do Linux tem, e o teste passava num e falhava no outro. O python3 é dado, não perguntado.
  it('avisa que o login do agy precisa de python3', () => {
    const agyPendente = [{ ia: 'agy' as const, instalado: true, conectado: false }];
    expect(juntar({ ...base(), python3: false }, agyPendente).precisaPty).toBe(true);
    expect(juntar({ ...base(), python3: true }, agyPendente).precisaPty).toBe(false);
  });

  it('não reclama de python3 quando o agy não está instalado', () => {
    const semPython = { ...base(), python3: false };
    expect(juntar(semPython, [{ ia: 'codex' as const, instalado: true, conectado: true }]).precisaPty).toBe(false);
  });
});

describe('relatorio: o que a pessoa realmente lê', () => {
  const texto = (d: ReturnType<typeof relatorio>) => d.linhas.join('\n');

  const com = (parcial: Partial<Diagnostico>) => ({
    ...diagnosticar(HOME),
    ...parcial,
  });

  const baseSaudavel = {
    temNavegador: true,
    extensaoRegistrada: true,
    ias: [{ ia: 'codex' as const, instalado: true, conectado: true }],
    pronto: true,
    temComoConectar: true,
    precisaPty: false,
  };

  it('dá código 0 e diz que está pronto quando tudo está resolvido', () => {
    const d = relatorio(com(baseSaudavel));
    expect(d.saida).toBe(0);
    expect(texto(d)).toContain('Tudo pronto');
    expect(texto(d)).toContain('codex');
  });

  // A pergunta principal de uma máquina que acabou de instalar o navegador. Se o relatório
  // responder "Tudo pronto", a pessoa abre o navegador e o BrOWSER não funciona.
  it('dá código 1 numa máquina virgem e diz o que falta', () => {
    const d = relatorio(
      com({
        temNavegador: false,
        extensaoRegistrada: false,
        ias: [],
        pronto: false,
        temComoConectar: false,
        navegador: [],
      }),
    );
    expect(d.saida).toBe(1);
    expect(texto(d)).toContain('nenhum navegador Chromium');
    expect(texto(d)).toContain('nenhuma ferramenta de IA instalada');
    expect(texto(d)).toContain('./bridge --install');
    expect(texto(d)).not.toContain('Tudo pronto');
  });

  it('não diz "pronto" só porque uma IA está logada, se a ponte não está registrada', () => {
    const d = relatorio(com({ ...baseSaudavel, extensaoRegistrada: false }));
    expect(d.saida).toBe(1);
  });

  it('não diz "pronto" se a ponte está registrada mas não há navegador', () => {
    const d = relatorio(com({ ...baseSaudavel, temNavegador: false }));
    expect(d.saida).toBe(1);
  });

  it('avisa quando a ponte está registrada mas o executável sumiu', () => {
    const d = relatorio(
      com({
        ...baseSaudavel,
        navegador: [{ nome: 'Chrome', pasta: '/x', existe: true, registrado: true, caminhoOk: false }],
      }),
    );
    expect(texto(d)).toContain('o executável da ponte não está mais no lugar');
  });

  // Contradição que apareceu na máquina real: o relatório dizia "✗ Chrome: executável não está mais
  // no lugar" e, dez linhas abaixo, "Tudo pronto". Registro quebrado não é ponte funcionando.
  it('NÃO diz "Tudo pronto" quando há registro apontando para executável que sumiu', () => {
    const d = relatorio(
      com({
        ...baseSaudavel,
        navegador: [{ nome: 'Chrome', pasta: '/x', existe: true, registrado: true, caminhoOk: false }],
      }),
    );
    expect(d.saida).toBe(1);
    expect(texto(d)).not.toContain('Tudo pronto');
    expect(texto(d)).toContain('Ainda não dá para usar');
  });

  it('avisa sobre python3 só quando o agy está instalado e é ele o login pendente', () => {
    const comAgy = com({
      ...baseSaudavel,
      pronto: false,
      ias: [{ ia: 'agy' as const, instalado: true, conectado: false }],
      precisaPty: true,
    });
    expect(texto(relatorio(comAgy))).toContain('precisa de python3');
  });

  it('distingue "instalada sem login" de "não instalada"', () => {
    const semLogin = relatorio(
      com({ ...baseSaudavel, pronto: false, ias: [{ ia: 'claude' as const, instalado: true, conectado: false }] }),
    );
    expect(texto(semLogin)).toContain('Claude (claude): instalada, ainda não conectada');
    expect(texto(semLogin)).toContain('Assinaturas > Conectar');
  });

  it('inclui o detalhe do porquê a IA não conectou, quando existe', () => {
    const d = relatorio(
      com({
        ...baseSaudavel,
        pronto: false,
        ias: [{ ia: 'codex' as const, instalado: true, conectado: false, detalhe: 'login expirado' }],
      }),
    );
    expect(texto(d)).toContain('(login expirado)');
  });

  it('nomeia a ferramenta pelo plano, não pelo executável', () => {
    const d = relatorio(com({ ...baseSaudavel, ias: [{ ia: 'agy' as const, instalado: true, conectado: true }] }));
    expect(texto(d)).toContain('Google AI Pro (agy)');
  });
});

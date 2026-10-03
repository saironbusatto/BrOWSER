import driveGoogle from '../../../skills/drive-google/SKILL.md' with { type: 'text' };
import { normalizarDominio } from './blueprints';

export type Skill = { nome: string; dominios: string[]; palavras: string[]; corpo: string };

// "Quando" de cada skill: o domínio da aba e/ou as palavras do pedido. O corpo (skills/<nome>/SKILL.md)
// entra no binário da ponte no build, então a skill chega para quem instalou a extensão.
const SKILLS: Skill[] = [{ nome: 'drive-google', dominios: ['drive.google.com'], palavras: ['drive'], corpo: driveGoogle }];

// Teto de quantas skills entram num pedido: cada uma é texto de prompt, e o pedido já carrega
// blueprint, anexos e as diretrizes.
const MAX_SKILLS = 2;
const ORCAMENTO_SKILL = 4_000;

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Escolhe as skills de site do pedido: a ponte carrega, como faz com o blueprint, então funciona
 * igual nos três CLIs. Skill é instrução de uso, não permissão — não abre porta nenhuma.
 *
 * ponytail: olha só a aba do começo do pedido, como o blueprint. Se a IA navegar para outro site no
 * meio da tarefa, a skill não entra — a diretiva geral do prompt ("prefira a busca do site") cobre
 * esse caso; reavaliar a cada tool call custaria uma ida ao cache por passo.
 */
export function escolherSkills(opts: { url?: string; pedido?: string }): Skill[] {
  const alvo = opts.url ? normalizarDominio(opts.url) : '';
  const pedido = semAcento(opts.pedido ?? '');
  return SKILLS.filter((s) => {
    const noSite = alvo !== '' && s.dominios.some((d) => alvo === d || alvo.endsWith(`.${d}`));
    const noPedido = s.palavras.some((p) => pedido.includes(semAcento(p)));
    return noSite || noPedido;
  }).slice(0, MAX_SKILLS);
}

export function formatarSkillsParaIa(skills: Skill[]): string {
  if (!skills.length) return '';
  let md = '\n---\n### 📘 COMO USAR ESTE SITE\n';
  for (const s of skills) {
    md += `**Skill \`${s.nome}\`:**\n${s.corpo.slice(0, ORCAMENTO_SKILL)}\n`;
  }
  return `${md}---\n`;
}

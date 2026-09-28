// bun scripts/site.ts → monta o GitHub Pages em dist-site/ (publicado por .github/workflows/pages.yml).
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const raiz = join(import.meta.dir, '..');
const saida = join(raiz, 'dist-site');
const site = join(raiz, 'site');

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

for (const f of ['index.html', 'estilo.css']) copyFileSync(join(site, f), join(saida, f));
copyFileSync(join(raiz, 'design', 'icone-512.png'), join(saida, 'icone.png'));
copyFileSync(join(raiz, 'packages', 'extension', 'public', 'icon', '32.png'), join(saida, 'favicon.png'));

// Campo de pontos: compila o mesmo módulo da extensão.
const r = await Bun.build({ entrypoints: [join(site, 'pontos.ts')], outdir: saida, naming: 'pontos.js', minify: true });
if (!r.success) throw new AggregateError(r.logs, 'falha ao compilar pontos.ts');

// Termos e privacidade: o documento do repositório vira página (a Chrome Web Store pede uma URL pública).
const md = readFileSync(join(raiz, 'docs', 'termos-e-privacidade.md'), 'utf8');
const modelo = readFileSync(join(site, 'privacidade.html'), 'utf8');
writeFileSync(join(saida, 'privacidade.html'), modelo.replace('{{conteudo}}', await marked.parse(md)));

console.log(`site montado em ${saida}`);

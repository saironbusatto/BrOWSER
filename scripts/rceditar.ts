// Grava o recurso de versão do PE no bridge.exe.
//
// O SignPath exige que todo binário assinado tenha ProductName e ProductVersion preenchidos
// (os termos: "All signed binaries must have metadata attributes set and enforced"). O
// `bun build --compile` não escreve esse recurso, então injetamos depois.
//
// O rcedit do npm é uma biblioteca, não um executável — não dá para chamar por `bunx rcedit`.
// E o binário que ele usa é um .exe, então isto só funciona em runner windows-latest.
//
// Uso: bun scripts/rceditar.ts <caminho-do-exe> <versao-aaaa-bb-cc.dd>
import { rcedit } from 'rcedit';

const [exe, versao] = process.argv.slice(2);
if (!exe || !versao) {
  console.error('uso: bun scripts/rceditar.ts <exe> <versao-aaaa-bb-cc.dd>');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+\.\d+$/.test(versao)) {
  console.error(`versão inválida: ${versao} (o Windows quer 4 partes numéricas, ex.: 0.1.0.0)`);
  process.exit(1);
}

await rcedit(exe, {
  'version-string': {
    FileDescription: 'bRowser — ponte nativa (MCP)',
    ProductName: 'BrOWSER',
    CompanyName: 'BrOWSER',
    LegalCopyright: 'Apache-2.0',
    InternalFilename: 'bridge',
    OriginalFilename: 'bridge.exe',
  },
  'file-version': versao,
  'product-version': versao,
  icon: 'design/icone.ico',
});

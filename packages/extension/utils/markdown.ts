import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

// A resposta da IA pode carregar texto de páginas hostis. Sem <img> (beacon que vaza dados),
// sem <form>/<input>/<style> (imitar a UI do painel); links abrem fora, sem referrer.
const PROIBIDAS = ['img', 'form', 'input', 'button', 'style', 'iframe', 'svg', 'video', 'audio'];

DOMPurify.addHook('afterSanitizeAttributes', (no) => {
  if (no.tagName === 'A') {
    no.setAttribute('target', '_blank');
    no.setAttribute('rel', 'noopener noreferrer');
  }
});

export function markdownSeguro(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string, { FORBID_TAGS: PROIBIDAS, FORBID_ATTR: ['style'] });
}

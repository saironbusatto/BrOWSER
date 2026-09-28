// Plano B (Q13): ler e preencher pelo DOM da própria página quando o chrome.debugger é bloqueado.
// As funções rodam DENTRO da página via chrome.scripting.executeScript({ func }): precisam ser
// autocontidas (sem imports nem variáveis de fora) — o Chrome serializa só o corpo delas.
import type { Campo } from '@browser/shared';

export const ATRIBUTO_REF = 'data-browser-ref';

export type LeituraDom = { url: string; titulo: string; campos: Campo[] };

export function lerCamposDom(): LeituraDom {
  const SELETOR = [
    'input:not([type=hidden])',
    'select',
    'textarea',
    'button',
    'a[href]',
    '[contenteditable=""]',
    '[contenteditable=true]',
    '[role=button]',
    '[role=checkbox]',
    '[role=radio]',
    '[role=combobox]',
    '[role=switch]',
    '[role=tab]',
    '[role=menuitem]',
    '[role=option]',
    '[role=textbox]',
  ].join(',');
  const visivel = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const papelDe = (el: HTMLElement): string => {
    const role = el.getAttribute('role');
    if (role) return role;
    const tag = el.tagName;
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA' || el.isContentEditable) return 'textbox';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'A') return 'link';
    const tipo = (el as HTMLInputElement).type;
    if (tipo === 'checkbox' || tipo === 'radio') return tipo;
    if (tipo === 'submit' || tipo === 'button' || tipo === 'reset') return 'button';
    if (['date', 'time', 'datetime-local', 'month', 'week'].includes(tipo)) return tipo;
    return 'textbox';
  };
  // innerText respeita o que está visível; textContent é o reserva (ex.: ambientes sem layout).
  const textoDe = (el?: HTMLElement | null) => (el ? (el.innerText ?? el.textContent ?? '') : '');
  // <label> que envolve o próprio controle: sem remover, o nome viria com as opções do select.
  const rotuloDe = (label?: HTMLElement | null) => {
    if (!label) return '';
    const copia = label.cloneNode(true) as HTMLElement;
    copia.querySelectorAll('input, select, textarea, button').forEach((c) => {
      c.remove();
    });
    return textoDe(copia);
  };
  const nomeDe = (el: HTMLElement): string => {
    const por = el.getAttribute('aria-labelledby');
    const texto =
      rotuloDe((el as HTMLInputElement).labels?.[0]) ||
      el.getAttribute('aria-label') ||
      (por ? textoDe(document.getElementById(por)) : '') ||
      el.getAttribute('placeholder') ||
      (el.tagName === 'INPUT' ? '' : textoDe(el)) ||
      el.getAttribute('title') ||
      el.getAttribute('name') ||
      '';
    return texto.replace(/\s+/g, ' ').trim().slice(0, 120);
  };

  const campos: Campo[] = [];
  let n = 0;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(SELETOR))) {
    if (!visivel(el)) continue;
    const ref = ++n;
    el.setAttribute('data-browser-ref', String(ref));
    const campo: Campo = { ref, papel: papelDe(el), nome: nomeDe(el) };
    const input = el as HTMLInputElement;
    // `type=password` entra na lista de campos (para a IA poder preenchê-lo) mas nunca ganha
    // `valor`: este arquivo roda dentro da página e é a última barreira antes do texto chegar à
    // IA. O tipo "password" vira papel próprio para a ponte saber que é campo sensível.
    if ((el as HTMLInputElement).type === 'password') {
      campo.papel = 'password';
      campo.sensivel = true;
    } else if (campo.papel === 'checkbox' || campo.papel === 'radio') {
      campo.marcado = input.checked;
    } else if ('value' in el && typeof input.value === 'string') {
      campo.valor = input.value;
    }
    if (input.required || el.getAttribute('aria-required') === 'true') campo.obrigatorio = true;
    if (el.tagName === 'SELECT' && campo.papel !== 'password') {
      campo.opcoes = Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim());
    }
    campos.push(campo);
  }
  return { url: location.href, titulo: document.title, campos };
}

export function preencherDom(ref: number, valor: string): { valor: string } {
  const el = document.querySelector<HTMLElement>(`[data-browser-ref="${ref}"]`);
  if (!el) throw new Error(`elemento ${ref} não encontrado: chame ler_campos de novo`);
  const disparar = (alvo: Element) => {
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
    alvo.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Escrita em campo sensível é normal (a senha vem do gerenciador do navegador ou do pedido);
  // a leitura de volta é que não acontece. `valor` na resposta é a confirmação, não o segredo.
  if (el instanceof HTMLSelectElement) {
    const alvo = valor.trim().toLowerCase();
    const opcao = Array.from(el.options).find((o) => o.value.toLowerCase() === alvo || o.text.trim().toLowerCase() === alvo);
    if (!opcao) throw new Error(`opção não encontrada: ${valor}`);
    el.value = opcao.value;
    disparar(el);
    return { valor: el.value };
  }

  const input = el as HTMLInputElement;
  if (input.type === 'checkbox' || input.type === 'radio') {
    const querido = !/^(false|não|nao|0|off|desmarcar)$/i.test(valor.trim());
    if (input.checked !== querido) input.click(); // click() dispara os eventos que frameworks escutam
    return { valor: String(input.checked) };
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = valor;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: valor }));
    return { valor: el.textContent ?? '' };
  }

  // Setter nativo do protótipo: o React ignora `el.value = x` (o rastreador dele não percebe a mudança).
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  el.focus();
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor);
  disparar(el);
  el.blur();
  return { valor: input.type === 'password' ? '[senha preenchida]' : input.value };
}

export function clicarDom(ref: number): { ok: true } {
  const el = document.querySelector<HTMLElement>(`[data-browser-ref="${ref}"]`);
  if (!el) throw new Error(`elemento ${ref} não encontrado: chame ler_campos de novo`);
  el.scrollIntoView({ block: 'center' });
  el.click();
  return { ok: true };
}

import type { AcaoGatilho, CampoBlueprint, SiteBlueprint, TelemetriaBlueprint } from '@browser/shared';
import { opcaoEstrutural, SELETOR_CAMPOS, siteSensivel, textoEstrutural } from '../utils/content-regra';

// Palavras-chave em botões que geralmente indicam submissão ou salvamento de formulário
const REGEX_BOTAO_SUBMIT = /salvar|enviar|confirmar|cadastrar|gravar|emitir|finalizar|concluir|prosseguir|submit|save|send|next/i;

let ultimoEnvioTimestamp = 0;
const COOLDOWN_ENVIO_MS = 2500;

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  main() {
    // 1. Escuta evento nativo de submit em formulários
    document.addEventListener(
      'submit',
      (evento) => {
        const form = evento.target as HTMLFormElement | null;
        if (form && form instanceof HTMLFormElement) {
          coletarEEnviarTelemetria(form, null);
        }
      },
      { capture: true, passive: true },
    );

    // 2. Escuta cliques em botões de ação (para SPAs sem tag <form> ou submits customizados)
    document.addEventListener(
      'click',
      (evento) => {
        const alvo = (evento.target as HTMLElement | null)?.closest(
          'button, input[type="submit"], [role="button"], a.btn, a.button',
        ) as HTMLElement | null;

        if (!alvo) return;

        const texto = (alvo.innerText || alvo.getAttribute('aria-label') || (alvo as HTMLInputElement).value || '').trim();
        const tipoSubmit = alvo.getAttribute('type') === 'submit';

        if (tipoSubmit || REGEX_BOTAO_SUBMIT.test(texto)) {
          const formPai = alvo.closest('form') as HTMLFormElement | null;
          coletarEEnviarTelemetria(formPai, alvo);
        }
      },
      { capture: true, passive: true },
    );
  },
});

/**
 * Coleta a estrutura de campos do formulário (GARANTIA TOTAL DE ZERO PII: nenhum valor é lido)
 * e envia para a bridge via background script.
 */
function coletarEEnviarTelemetria(form: HTMLFormElement | null, botaoGatilho: HTMLElement | null) {
  const agora = Date.now();
  if (agora - ultimoEnvioTimestamp < COOLDOWN_ENVIO_MS) {
    return;
  }
  ultimoEnvioTimestamp = agora;

  const urlCompleta = window.location.href;
  // Ignora páginas internas do Chrome ou extensões
  if (urlCompleta.startsWith('chrome://') || urlCompleta.startsWith('chrome-extension://')) {
    return;
  }

  const host = window.location.host;
  const dominio = host.includes('localhost') || host.includes('127.0.0.1') ? host.replace(':', '-') : host.toLowerCase();

  // Escopo de busca dos elementos
  const container: ParentNode = form || document.body;
  // Não recolhe a estrutura de páginas onde a pessoa digita senha ou código de cartão: são login
  // e pagamento, os dois casos em que um mapa não é nada útil e o estrago seria real.
  if (siteSensivel(host)) return;

  // `type=password` fica de fora (ver SELETOR_CAMPOS): o mapa é público e não tem por que registrar
  // que a página tem um campo de senha. Preencher segue possível — quem faz isso é o CDP/plano B.
  const elementos = container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(SELETOR_CAMPOS);

  if (elementos.length === 0) return;

  const camposBlueprint: CampoBlueprint[] = [];
  const idsVistos = new Set<string>();

  for (const el of Array.from(elementos)) {
    // Pula elementos invisíveis
    if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;

    // Filtro de PII no navegador, antes de qualquer envio: o content script roda em todas as
    // páginas e não pode ser o elo fraco da cadeia.
    const rotulo = textoEstrutural(extrairRotulo(el));
    if (!rotulo) continue;

    const papel = extrairPapel(el);
    const idSemantico = gerarIdSemantico(rotulo);

    if (idsVistos.has(idSemantico)) continue;
    idsVistos.add(idSemantico);

    const campo: CampoBlueprint = {
      idSemantico,
      rotulo,
      papel,
      seletorAcessivel: rotulo,
    };

    if (el.required || el.getAttribute('aria-required') === 'true') {
      campo.obrigatorio = true;
    }

    if (el.tagName === 'SELECT') {
      // Opção que carrega documento/endereço salvo é descartada, não mascarada: um "<CEP>"
      // ocupando o lugar de "São Paulo" quebraria o preenchimento sem proteger ninguém.
      const opcoes = Array.from((el as HTMLSelectElement).options)
        .map((o) => opcaoEstrutural(o.text))
        .filter((o): o is string => o !== null);
      if (opcoes.length > 0 && opcoes.length < 50) {
        campo.opcoes = opcoes;
      }
    }

    // Heurísticas de tipo e absorção de telemetria do Chrome Autofill
    campo.tipoEsperado = detectarTipoEsperado(el, rotulo);

    camposBlueprint.push(campo);
  }

  if (camposBlueprint.length === 0) return;

  // Mapeia o gatilho se houver botão identificado
  const gatilhos: AcaoGatilho[] = [];
  if (botaoGatilho) {
    const textoBotao = (botaoGatilho.innerText || botaoGatilho.getAttribute('aria-label') || (botaoGatilho as HTMLInputElement).value || '')
      .replace(/[\n\r\t]+/g, ' ')
      .trim();

    const descricaoBotao = opcaoEstrutural(textoBotao);
    if (descricaoBotao) {
      gatilhos.push({
        descricao: descricaoBotao,
        seletorOuNome: descricaoBotao,
        tipo: 'click',
      });
    }
  }

  const blueprint: SiteBlueprint = {
    $schema: 'https://browser.ai/schemas/blueprint.v1.json',
    dominio,
    versao: '1.0.0',
    titulo: (document.title || dominio).replace(/[\n\r\t]+/g, ' ').trim(),
    atualizadoEm: new Date().toISOString(),
    gatilhos,
    campos: camposBlueprint,
  };

  const mensagem: TelemetriaBlueprint = {
    tipo: 'telemetria_blueprint',
    blueprint,
  };

  try {
    chrome.runtime.sendMessage(mensagem).catch(() => {});
  } catch {}
}

/**
 * Extrai o rótulo do campo buscando:
 * 1. <label for="...">
 * 2. <label> pai
 * 3. aria-label ou aria-labelledby
 * 4. placeholder
 * 5. name ou title
 */
function extrairRotulo(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  // 1. label por id
  if (el.id) {
    const labelFor = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (labelFor?.innerText?.trim()) return labelFor.innerText.trim();
  }

  // 2. label ancestral
  const labelPai = el.closest('label');
  if (labelPai?.innerText?.trim()) {
    // Remove o texto do próprio input se estiver dentro
    return labelPai.innerText.replace(el.value || '', '').trim();
  }

  // 3. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const elLabel = document.getElementById(labelledBy);
    if (elLabel?.innerText?.trim()) return elLabel.innerText.trim();
  }

  // 4. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 5. placeholder
  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim();

  // 6. name ou title
  return (el.name || el.title || '').trim();
}

function extrairPapel(el: HTMLElement): string {
  const role = el.getAttribute('role');
  if (role) return role;

  if (el.tagName === 'SELECT') return 'combobox';
  if (el.tagName === 'TEXTAREA') return 'textbox';

  const type = el.getAttribute('type')?.toLowerCase();
  if (type === 'password') return 'password';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'radio') return 'radio';
  if (type === 'date') return 'date';
  if (type === 'search') return 'searchbox';
  return 'textbox';
}

/**
 * Detecta o tipo semântico esperado unindo:
 * - Atributos 'autocomplete' do W3C (que o Chrome Autofill utiliza diretamente)
 * - Pseudo-classe :autofill do Chrome
 * - Tipos HTML nativos
 * - Heurísticas textuais do rótulo
 */
function detectarTipoEsperado(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  rotulo: string,
): CampoBlueprint['tipoEsperado'] {
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  const rotuloLower = rotulo.toLowerCase();

  // 1. Absorção direta das diretivas de Autofill do navegador
  if (autocomplete) {
    if (autocomplete.includes('email')) return 'email';
    if (autocomplete.includes('tel') || autocomplete.includes('phone')) return 'telefone';
    if (autocomplete.includes('postal-code') || autocomplete.includes('zip')) return 'cep';
    if (autocomplete.includes('bday') || autocomplete.includes('birth')) return 'data';
    if (autocomplete.includes('address-line') || autocomplete.includes('street')) return 'endereco';
    if (autocomplete.includes('organization') || autocomplete.includes('company')) return 'empresa';
    if (autocomplete.includes('name')) return 'nome';
  }

  // 2. Tipos HTML nativos
  if (type === 'email') return 'email';
  if (type === 'tel') return 'telefone';
  if (type === 'date' || type === 'datetime-local') return 'data';
  if (type === 'number' && (rotuloLower.includes('preço') || rotuloLower.includes('valor') || rotuloLower.includes('preco'))) {
    return 'moeda';
  }

  // 3. Heurísticas por rótulo textual brasileiro/internacional
  if (rotuloLower.includes('cnpj')) return 'cnpj';
  if (rotuloLower.includes('cpf')) return 'cpf';
  if (rotuloLower.includes('e-mail') || rotuloLower.includes('email')) return 'email';
  if (
    rotuloLower.includes('telefone') ||
    rotuloLower.includes('celular') ||
    rotuloLower.includes('fone') ||
    rotuloLower.includes('whatsapp')
  )
    return 'telefone';
  if (rotuloLower.includes('cep') || rotuloLower.includes('código postal') || rotuloLower.includes('codigo postal')) return 'cep';
  if (
    rotuloLower.includes('data') ||
    rotuloLower.includes('nascimento') ||
    rotuloLower.includes('vencimento') ||
    rotuloLower.includes('emissão') ||
    rotuloLower.includes('emissao')
  )
    return 'data';
  if (rotuloLower.includes('valor') || rotuloLower.includes('preço') || rotuloLower.includes('preco') || rotuloLower.includes('total'))
    return 'moeda';
  if (
    rotuloLower.includes('endereço') ||
    rotuloLower.includes('endereco') ||
    rotuloLower.includes('rua') ||
    rotuloLower.includes('bairro') ||
    rotuloLower.includes('logradouro')
  )
    return 'endereco';

  return 'texto';
}

function gerarIdSemantico(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'campo'
  );
}

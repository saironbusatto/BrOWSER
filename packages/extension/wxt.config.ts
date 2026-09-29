import { defineConfig } from 'wxt';
import { CONECTORES } from './utils/conectores';

// WXT não popula process.env a partir de .env, e sem isso o dev local teria que exportar a
// variável na mão toda vez. process.loadEnvFile é stdlib (Node 20.12+); se não houver .env,
// a variável do ambiente/CI manda.
try {
  process.loadEnvFile();
} catch {
  // sem .env: o CI e o shell mandam
}

// Client ID do app de desktop do Google Cloud (credencial "Desktop app", tipo 3).
// É público por definição — o segredo real é o refresh token, que fica no keyring do Chrome.
// Vazio = o Google ainda não foi configurado; utils/conectores.ts desliga o botão nesse caso.
const GOOGLE_CLIENT_ID = process.env.BROWSER_GOOGLE_CLIENT_ID ?? '';

export default defineConfig({
  manifest: {
    name: 'BrOWSER',
    description: 'Preenche formulários com IA a partir de linguagem natural.',
    // ponytail: `key` fixa o ID (koflj...) exigido pelo allowed_origins do Native Messaging, mas a
    // Chrome Web Store rejeita o campo. BROWSER_STORE=1 gera o pacote da loja sem ele; ao sair o ID
    // da loja, acrescentar em EXTENSION_IDS_ADICIONAIS (bridge) para os dois conviverem.
    ...(process.env.BROWSER_STORE
      ? {}
      : {
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn3lQkObaEh+laVhT2LMHii4So3q0odMBMjCmq7ciJ/b3TaZ9/7awVc9AP8weF/WMXXKaKetvriWmzAmPWfnMcIiGB6aLrZJzyDtEJvee6AkWkvgaf9oLjo5bZzLsXU5etn5sahVmJVSyuv7nF+jTFtj5TN9QGha82FLrbOAl2TID7fKAYaowR8SiVv/goQ8Pk2+yw6dsUwoi+kDcnXYk/dxA/8ojIa52O7CAR980AFn8AKOz9XgdN5VALFufs3LUa1yAn1P7eX8cwJhSOXg65RI3g2WFVxaPsPkYdnx0ZysT7MOtB8tbMwLBLSQLHaM0uIOsrE8htdwsLcQdKJssAQIDAQAB',
        }),
    // `identity` é o OAuth dos conectores (Google Drive). Só o client_id vai no manifest —
    // o refresh token nunca sai do keyring do navegador (utils/conectores.ts).
    permissions: ['debugger', 'nativeMessaging', 'tabs', 'webNavigation', 'sidePanel', 'scripting', 'storage', 'identity'],
    // Plano B por DOM (chrome.scripting) precisa de acesso às páginas; o content.ts já roda em todas.
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Abrir o BrOWSER' },
    ...(GOOGLE_CLIENT_ID && {
      oauth2: {
        client_id: GOOGLE_CLIENT_ID,
        scopes: CONECTORES.map((c) => c.escopo),
      },
    }),
  },
});

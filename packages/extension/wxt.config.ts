import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'bRowser',
    description: 'Preenche formulários com IA a partir de linguagem natural.',
    // Chave pública só fixa o ID da extensão (kofljccjbobcbcfnnolfgbobkckmiboe),
    // exigido em allowed_origins do Native Messaging. Não é segredo.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn3lQkObaEh+laVhT2LMHii4So3q0odMBMjCmq7ciJ/b3TaZ9/7awVc9AP8weF/WMXXKaKetvriWmzAmPWfnMcIiGB6aLrZJzyDtEJvee6AkWkvgaf9oLjo5bZzLsXU5etn5sahVmJVSyuv7nF+jTFtj5TN9QGha82FLrbOAl2TID7fKAYaowR8SiVv/goQ8Pk2+yw6dsUwoi+kDcnXYk/dxA/8ojIa52O7CAR980AFn8AKOz9XgdN5VALFufs3LUa1yAn1P7eX8cwJhSOXg65RI3g2WFVxaPsPkYdnx0ZysT7MOtB8tbMwLBLSQLHaM0uIOsrE8htdwsLcQdKJssAQIDAQAB',
    permissions: ['debugger', 'nativeMessaging', 'tabs'],
  },
});

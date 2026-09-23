import type { CollectionConfig } from 'payload'

import { authenticated, superAdminOnly } from '../access/roles'

/**
 * Caixa de entrada do formulário de contato (contrato colecoes.md).
 *
 * ESCRITA PÚBLICA, e é a única do projeto assim: um formulário de contato que exige
 * autenticação não é formulário de contato. É por isso que aqui não há rich text, os
 * campos têm teto de tamanho, e o endpoint do site (não esta coleção) segura honeypot e
 * limite por IP — validação de spam é do transporte, o schema só garante o formato.
 *
 * Leitura, edição e remoção seguem fechadas: mensagem de leitor não é conteúdo público.
 *
 * Sem `versions`: mensagem não tem rascunho nem histórico de revisão — ela chega uma vez.
 */
export const Mensagens: CollectionConfig = {
  slug: 'mensagens',
  admin: {
    group: 'Conteúdo',
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'email', 'lida', 'createdAt'],
  },
  access: {
    // pública: o site posta sem sessão. Os limites moram no endpoint, não aqui.
    create: () => true,
    read: authenticated,
    update: authenticated,
    delete: superAdminOnly,
  },
  fields: [
    { name: 'nome', type: 'text', required: true, maxLength: 120 },
    { name: 'email', type: 'email', required: true },
    { name: 'mensagem', type: 'textarea', required: true, maxLength: 4000 },
    {
      name: 'origem_url',
      type: 'text',
      admin: { description: 'de qual página a pessoa escreveu' },
    },
    {
      name: 'lida',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'a caixa de entrada é a lista de não-lidas' },
    },
    {
      name: 'user_agent',
      type: 'text',
      admin: { readOnly: true, description: 'preenchido pelo endpoint' },
    },
    {
      name: 'ip_hash',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'IP HASHEADO — o cru nunca é gravado (mesma regra do redirect de afiliado)',
      },
    },
  ],
}

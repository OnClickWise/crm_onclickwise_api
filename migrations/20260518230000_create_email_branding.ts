import type { Knex } from 'knex';

/**
 * Configuração de email + branding por organização (usado em PDFs e emails).
 *
 *  - `organization_branding`: logo, cores, header/footer customizado por org.
 *    Usado pelo PDF service. Uma linha por organização (1:1).
 *
 *  - `organization_email_settings`: SMTP por organização. Senha guardada
 *    com indicação de encrypted, mas para MVP usamos texto direto (em prod,
 *    integraremos com KMS). 1:1 com org.
 *
 *  - `sent_emails`: auditoria de emails enviados (compliance ISO 9001).
 *    Quem enviou, para quem, com qual documento anexado, status, mensagem
 *    de erro se falhou.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('organization_branding'))) {
    await knex.schema.createTable('organization_branding', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .unique() // 1:1
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Logo (URL absoluta — pode vir do módulo uploads)
      table.string('logo_url', 1000).nullable();
      // Cores corporativas (hex)
      table.string('primary_color', 9).notNullable().defaultTo('#2563eb');
      table.string('secondary_color', 9).notNullable().defaultTo('#1e293b');

      // Dados legais que aparecem em todo doc fiscal
      table.string('company_legal_name', 255).nullable();
      table.string('company_tax_id', 50).nullable();
      table.string('company_tax_id_type', 20).nullable();
      table.text('company_address').nullable();
      table.string('company_city', 120).nullable();
      table.string('company_country', 2).nullable();
      table.string('company_phone', 50).nullable();
      table.string('company_email', 255).nullable();
      table.string('company_website', 255).nullable();

      // Texto livre no rodapé (banco para depósito, prazo de validade, etc.)
      table.text('document_footer').nullable();
      // Texto de boas-vindas em emails
      table.text('email_signature').nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('organization_email_settings'))) {
    await knex.schema.createTable('organization_email_settings', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .unique()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // SMTP config
      table.string('smtp_host', 255).notNullable();
      table.integer('smtp_port').notNullable().defaultTo(587);
      table.boolean('smtp_secure').notNullable().defaultTo(false); // TLS direto vs STARTTLS
      table.string('smtp_user', 255).notNullable();
      // ⚠ MVP: texto direto. Produção: usar KMS/vault e marcar `is_encrypted`.
      table.text('smtp_password').notNullable();
      table.boolean('is_encrypted').notNullable().defaultTo(false);

      // Remetente padrão
      table.string('from_email', 255).notNullable();
      table.string('from_name', 180).notNullable();
      // Reply-to opcional (caixa diferente do envio)
      table.string('reply_to', 255).nullable();

      // BCC automático em todo envio (auditoria)
      table.string('bcc', 255).nullable();

      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('last_test_at', { useTz: true }).nullable();
      table.text('last_test_result').nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('sent_emails'))) {
    await knex.schema.createTable('sent_emails', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Quem enviou (sistema OU usuário)
      table.uuid('sent_by').nullable().references('id').inTable('users').onDelete('SET NULL');

      // Referência polimórfica (sales_document, customer_statement, recibo…)
      table.string('reference_type', 40).nullable();
      table.uuid('reference_id').nullable();

      table.string('to_email', 500).notNullable(); // pode ter múltiplos separados por ;
      table.string('cc', 500).nullable();
      table.string('bcc', 500).nullable();
      table.string('subject', 500).notNullable();
      table.text('body').notNullable();

      // Anexos (apenas metadata; arquivo gerado on-the-fly)
      table.jsonb('attachments_meta').nullable();

      // 'queued' | 'sending' | 'sent' | 'failed'
      table.string('status', 20).notNullable().defaultTo('queued');
      table.text('error_message').nullable();
      table.string('smtp_message_id', 255).nullable();

      table.timestamp('queued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('sent_at', { useTz: true }).nullable();

      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'reference_type', 'reference_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sent_emails');
  await knex.schema.dropTableIfExists('organization_email_settings');
  await knex.schema.dropTableIfExists('organization_branding');
}

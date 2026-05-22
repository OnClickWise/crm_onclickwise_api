import type { Knex } from 'knex';

/**
 * Módulo de Prospecção B2B (estilo Apollo/Lusha).
 *
 * Visão geral:
 *  - prospect_companies / prospect_people: cache LOCAL de empresas/pessoas vindas
 *    do Apollo. Persistir aqui evita re-cobrar créditos em re-enrichments e dá
 *    autonomia ao cliente (busca offline, exports, integração com pipeline).
 *
 *  - prospect_lists / prospect_list_items: o usuário organiza prospects em listas
 *    (ex.: "ICP A — CTOs SaaS Brasil"). N:N entre lista e pessoa/empresa.
 *
 *  - prospect_searches: log de auditoria — toda busca/enrich registrada. Útil pra
 *    analytics ("quanto crédito foi gasto?", "quais filtros performam?") + GDPR.
 *
 *  - prospect_credits: quota mensal por organização. Permite billing/limites.
 *
 *  - prospect_apollo_cache: cache de respostas Apollo (TTL 30d). Reduz drasticamente
 *    o consumo de créditos em buscas repetidas. Key = MD5(endpoint + params).
 *
 *  - prospect_lead_links: vincula prospect → lead do CRM, evita duplicação e
 *    permite tracking "este lead veio da prospecção".
 */
export async function up(knex: Knex): Promise<void> {
  const hasOrg = await knex.schema.hasTable('organizations');
  if (!hasOrg) {
    throw new Error('Tabela organizations não encontrada. Rode migrations anteriores.');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT COMPANIES
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_companies'))) {
    await knex.schema.createTable('prospect_companies', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // 'apollo' | 'clearbit' | 'manual' | 'imported' — abertura pra outros providers no futuro.
      table.string('source', 30).notNullable().defaultTo('apollo');
      // ID externo do provider (ex.: Apollo organization id).
      table.string('source_id', 64).nullable();

      // Identificação básica
      table.string('name', 255).notNullable();
      table.string('domain', 255).nullable();
      table.string('website_url', 500).nullable();
      table.string('linkedin_url', 500).nullable();
      table.string('twitter_url', 500).nullable();
      table.string('facebook_url', 500).nullable();
      table.string('phone', 50).nullable();

      // Classificação
      table.string('industry', 120).nullable();
      table.specificType('keywords', 'text[]').nullable();
      table.integer('founded_year').nullable();
      // Faixa de funcionários (string pra preservar formato Apollo: "1-10", "11-50", etc.)
      table.string('employee_range', 30).nullable();
      table.integer('employee_count').nullable();
      table.bigInteger('annual_revenue').nullable(); // USD
      table.string('annual_revenue_range', 50).nullable();

      // Localização
      table.string('country', 100).nullable();
      table.string('state', 120).nullable();
      table.string('city', 120).nullable();
      table.string('postal_code', 30).nullable();
      table.string('address', 500).nullable();

      // Enriquecimento
      table.specificType('technologies', 'text[]').nullable(); // BuiltWith-like
      table.text('description').nullable();
      table.string('logo_url', 500).nullable();

      // Funding (quando disponível via Apollo)
      table.string('latest_funding_stage', 60).nullable();
      table.bigInteger('total_funding').nullable();
      table.date('latest_funding_date').nullable();

      // Auditoria local
      table.boolean('enriched').notNullable().defaultTo(false);
      table.timestamp('enriched_at', { useTz: true }).nullable();
      table.integer('enrichment_credits_used').notNullable().defaultTo(0);

      // Raw response do Apollo, pra debugging e features futuras sem nova migration.
      table.jsonb('raw_data').nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Mesmo source_id (Apollo) pode aparecer em orgs diferentes — unique por (org, source, source_id).
      table.unique(['organization_id', 'source', 'source_id']);
      table.index(['organization_id', 'domain']);
      table.index(['organization_id', 'name']);
      table.index(['organization_id', 'industry']);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT PEOPLE
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_people'))) {
    await knex.schema.createTable('prospect_people', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('source', 30).notNullable().defaultTo('apollo');
      table.string('source_id', 64).nullable();

      // Nome
      table.string('full_name', 255).notNullable();
      table.string('first_name', 120).nullable();
      table.string('last_name', 120).nullable();

      // Cargo / função
      table.string('title', 255).nullable();
      table.string('headline', 500).nullable();
      table.string('seniority', 60).nullable(); // owner, founder, c_suite, vp, director, manager, senior, entry, intern
      table.specificType('departments', 'text[]').nullable(); // engineering, sales, marketing...
      table.specificType('subdepartments', 'text[]').nullable();
      table.specificType('functions', 'text[]').nullable();

      // Empresa atual
      table
        .uuid('company_id')
        .nullable()
        .references('id')
        .inTable('prospect_companies')
        .onDelete('SET NULL');
      // Snapshot da empresa (caso a FK seja perdida — pra histórico)
      table.string('company_name', 255).nullable();
      table.string('company_domain', 255).nullable();

      // Contato — só populado após enrichment (custa créditos)
      table.string('email', 255).nullable();
      // 'verified' (catch-all check ok), 'guessed' (padrão da empresa), 'unavailable', 'locked' (não enriquecido ainda)
      table.string('email_status', 30).notNullable().defaultTo('locked');
      table.string('phone', 50).nullable();
      table.string('mobile_phone', 50).nullable();
      table.string('linkedin_url', 500).nullable();
      table.string('twitter_url', 500).nullable();
      table.string('github_url', 500).nullable();
      table.string('photo_url', 500).nullable();

      // Localização
      table.string('country', 100).nullable();
      table.string('state', 120).nullable();
      table.string('city', 120).nullable();

      // Background
      table.text('summary').nullable();

      // Enriquecimento
      table.boolean('enriched').notNullable().defaultTo(false);
      table.timestamp('enriched_at', { useTz: true }).nullable();
      table.integer('enrichment_credits_used').notNullable().defaultTo(0);

      // Status quanto à conversão em lead
      table.boolean('converted_to_lead').notNullable().defaultTo(false);
      // FK ao lead criado — opcional pra não criar dependência rígida.
      table.uuid('lead_id').nullable();

      table.jsonb('raw_data').nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'source', 'source_id']);
      table.index(['organization_id', 'email']);
      table.index(['organization_id', 'company_id']);
      table.index(['organization_id', 'seniority']);
      table.index(['organization_id', 'enriched']);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT LISTS
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_lists'))) {
    await knex.schema.createTable('prospect_lists', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('name', 180).notNullable();
      table.text('description').nullable();
      // Cor pra UI (#hex)
      table.string('color', 9).notNullable().defaultTo('#6366F1');
      // ICP, target account list, marketing campaign, …
      table.string('list_type', 30).notNullable().defaultTo('prospects');
      table.boolean('is_archived').notNullable().defaultTo(false);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'is_archived']);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT LIST ITEMS — N:N (lista vs pessoa OU empresa)
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_list_items'))) {
    await knex.schema.createTable('prospect_list_items', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('list_id')
        .notNullable()
        .references('id')
        .inTable('prospect_lists')
        .onDelete('CASCADE');

      // 'person' | 'company' — discriminador
      table.string('item_type', 20).notNullable();
      // FK lógica (não FK física porque varia entre 2 tabelas)
      table.uuid('item_id').notNullable();

      table.text('notes').nullable();
      table.uuid('added_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('added_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Evita duplicação na mesma lista.
      table.unique(['list_id', 'item_type', 'item_id']);
      table.index(['organization_id', 'list_id']);
      table.index(['organization_id', 'item_type', 'item_id']);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT SEARCHES — Audit log
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_searches'))) {
    await knex.schema.createTable('prospect_searches', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // 'company_search' | 'people_search' | 'person_enrich' | 'company_enrich'
      table.string('search_type', 30).notNullable();
      table.jsonb('filters').notNullable().defaultTo('{}');
      table.integer('results_count').notNullable().defaultTo(0);
      table.integer('credits_used').notNullable().defaultTo(0);
      table.boolean('served_from_cache').notNullable().defaultTo(false);

      table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'created_at']);
      table.index(['organization_id', 'search_type']);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT CREDITS — quota mensal
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_credits'))) {
    await knex.schema.createTable('prospect_credits', (table) => {
      table
        .uuid('organization_id')
        .primary()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Quota mensal (configurável pelo admin de plataforma).
      table.integer('monthly_quota').notNullable().defaultTo(100);
      table.integer('used_this_period').notNullable().defaultTo(0);
      table.integer('rollover_credits').notNullable().defaultTo(0);

      // Período corrente (cada mês reseta `used_this_period`).
      table.date('period_start').notNullable().defaultTo(knex.fn.now());

      table.timestamp('last_reset_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT APOLLO CACHE — TTL 30d
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_apollo_cache'))) {
    await knex.schema.createTable('prospect_apollo_cache', (table) => {
      // MD5/SHA1 do {endpoint + params normalizados}. Não tem org porque a resposta
      // Apollo é pública (não-org-específica) — pode ser compartilhada entre orgs.
      table.string('cache_key', 64).primary();
      table.string('endpoint', 100).notNullable();
      table.jsonb('payload').notNullable();
      table.timestamp('expires_at', { useTz: true }).notNullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['expires_at']);
      table.index(['endpoint']);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PROSPECT LEAD LINKS — rastreabilidade prospect → lead
  // ═════════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_lead_links'))) {
    await knex.schema.createTable('prospect_lead_links', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('person_id')
        .notNullable()
        .references('id')
        .inTable('prospect_people')
        .onDelete('CASCADE');
      // FK lógica (não rígida — leads pode ter PK em formato diferente em algumas orgs).
      table.uuid('lead_id').notNullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'person_id', 'lead_id']);
      table.index(['organization_id', 'lead_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('prospect_lead_links');
  await knex.schema.dropTableIfExists('prospect_apollo_cache');
  await knex.schema.dropTableIfExists('prospect_credits');
  await knex.schema.dropTableIfExists('prospect_searches');
  await knex.schema.dropTableIfExists('prospect_list_items');
  await knex.schema.dropTableIfExists('prospect_lists');
  await knex.schema.dropTableIfExists('prospect_people');
  await knex.schema.dropTableIfExists('prospect_companies');
}

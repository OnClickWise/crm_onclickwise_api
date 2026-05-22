import type { Knex } from 'knex';

/**
 * Fase B do módulo de Prospecção:
 *
 *   - prospect_icps: perfis "Ideal Customer Profile" — critérios + pesos.
 *     Cada org pode ter múltiplos ICPs (ex.: ICP A SaaS, ICP B Marketplace).
 *
 *   - prospect_sequences + prospect_sequence_steps + prospect_sequence_enrollments
 *     + prospect_sequence_step_executions: cadências multi-touch (D1 email,
 *     D3 LinkedIn, D7 follow-up...). Steps definem a estrutura, enrollments
 *     ligam pessoas à cadência, executions registram o que foi feito.
 *
 *   - prospect_triggers + prospect_trigger_events: gatilhos de prospecção
 *     (ex.: "alertar quando empresa X postar vaga de eng."). O `last_check_at`
 *     permite rodar verificações periódicas sem reprocessar tudo.
 *
 *   - prospect_people.fit_score: cache do score ICP — recalculado quando o ICP
 *     ativo muda ou quando a pessoa é enriquecida.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('organizations'))) {
    throw new Error('organizations não encontrada — rode migrations anteriores');
  }
  if (!(await knex.schema.hasTable('prospect_people'))) {
    throw new Error('prospect_people não encontrada — rode migration de Fase A primeiro');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_ICPS
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_icps'))) {
    await knex.schema.createTable('prospect_icps', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('name', 180).notNullable();
      table.text('description').nullable();
      table.string('color', 9).notNullable().defaultTo('#10B981');
      table.boolean('is_default').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);

      // Critérios de match (jsonb pra evolução sem migration):
      // {
      //   industries: ['SaaS', 'Fintech'],
      //   employee_min: 50, employee_max: 500,
      //   countries: ['BR', 'US'],
      //   technologies: ['react', 'aws'],
      //   seniorities: ['c_suite', 'vp', 'director'],
      //   departments: ['engineering'],
      //   keywords_in_title: ['CTO', 'VP Eng']
      // }
      table.jsonb('criteria').notNullable().defaultTo('{}');

      // Pesos por critério (0-100). Quanto maior, mais impacta o score final.
      // {
      //   industry: 30, employee_size: 20, country: 10,
      //   technology: 15, seniority: 15, department: 10
      // }
      table.jsonb('weights').notNullable().defaultTo('{}');

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'is_active']);
      table.unique(['organization_id', 'name']);
    });
  }

  // Score cache em prospect_people
  if (!(await knex.schema.hasColumn('prospect_people', 'fit_score'))) {
    await knex.schema.alterTable('prospect_people', (table) => {
      // 0-100 — null indica "não calculado".
      table.integer('fit_score').nullable();
      table.uuid('fit_score_icp_id').nullable();
      table.timestamp('fit_score_at', { useTz: true }).nullable();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_SEQUENCES
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_sequences'))) {
    await knex.schema.createTable('prospect_sequences', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('name', 180).notNullable();
      table.text('description').nullable();
      table.string('color', 9).notNullable().defaultTo('#6366F1');

      // 'draft' | 'active' | 'paused' | 'archived'
      table.string('status', 20).notNullable().defaultTo('draft');

      // Configuração geral da cadência
      // - skip_weekends: pula sáb/dom no cálculo de wait
      // - working_hours_only: dispara só em horário comercial
      // - stop_on_reply: pausa enrollment ao detectar resposta
      table.jsonb('settings').notNullable().defaultTo('{"skip_weekends": true, "stop_on_reply": true}');

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'status']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_SEQUENCE_STEPS
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_sequence_steps'))) {
    await knex.schema.createTable('prospect_sequence_steps', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('sequence_id')
        .notNullable()
        .references('id')
        .inTable('prospect_sequences')
        .onDelete('CASCADE');

      table.integer('step_order').notNullable();

      // Tipos: email_manual (vendedor envia), email_auto (sistema envia se SMTP),
      // linkedin_connect, linkedin_message, call_task, custom_task, wait
      table.string('step_type', 30).notNullable();

      // Quantos dias esperar APÓS o step anterior antes de disparar este.
      // Step 1 = 0 (executa imediatamente ao inscrever).
      table.integer('wait_days').notNullable().defaultTo(0);

      table.string('subject', 255).nullable();
      // Template com variáveis {first_name}, {company_name}, {title}...
      table.text('body_template').nullable();
      // Notas internas (orientação pro vendedor).
      table.text('notes').nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['sequence_id', 'step_order']);
      table.index(['organization_id', 'sequence_id']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_SEQUENCE_ENROLLMENTS
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_sequence_enrollments'))) {
    await knex.schema.createTable('prospect_sequence_enrollments', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('sequence_id')
        .notNullable()
        .references('id')
        .inTable('prospect_sequences')
        .onDelete('CASCADE');
      table
        .uuid('person_id')
        .notNullable()
        .references('id')
        .inTable('prospect_people')
        .onDelete('CASCADE');

      // 'active' | 'paused' | 'completed' | 'replied' | 'unsubscribed' | 'failed'
      table.string('status', 20).notNullable().defaultTo('active');

      table.integer('current_step_order').notNullable().defaultTo(0);
      table.timestamp('next_action_at', { useTz: true }).nullable();
      table.timestamp('paused_at', { useTz: true }).nullable();
      table.timestamp('completed_at', { useTz: true }).nullable();
      table.text('pause_reason').nullable();

      table.uuid('assigned_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('enrolled_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('enrolled_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Idempotência: mesma pessoa não entra 2x na mesma cadência ativa.
      table.unique(['sequence_id', 'person_id']);
      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'next_action_at']);
      table.index(['assigned_user_id', 'status']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_SEQUENCE_STEP_EXECUTIONS — log de execução
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_sequence_step_executions'))) {
    await knex.schema.createTable('prospect_sequence_step_executions', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('enrollment_id')
        .notNullable()
        .references('id')
        .inTable('prospect_sequence_enrollments')
        .onDelete('CASCADE');
      table
        .uuid('step_id')
        .notNullable()
        .references('id')
        .inTable('prospect_sequence_steps')
        .onDelete('CASCADE');

      // 'pending' | 'completed' | 'skipped' | 'failed'
      table.string('status', 20).notNullable().defaultTo('pending');
      table.timestamp('scheduled_for', { useTz: true }).notNullable();
      table.timestamp('executed_at', { useTz: true }).nullable();
      table.text('outcome_notes').nullable();
      table.uuid('executed_by').nullable().references('id').inTable('users').onDelete('SET NULL');

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'status', 'scheduled_for']);
      table.index(['enrollment_id']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_TRIGGERS
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_triggers'))) {
    await knex.schema.createTable('prospect_triggers', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('name', 180).notNullable();
      table.text('description').nullable();

      // Tipos: 'job_posting' (empresa postou vaga), 'employee_growth' (empresa
      // contratou X pessoas), 'funding_round' (empresa captou),
      // 'tech_adoption' (empresa adotou tecnologia), 'manual' (cliente cria)
      table.string('trigger_type', 30).notNullable();

      // Filtros que definem QUANDO disparar.
      // {
      //   target_companies: ['stripe.com'],   // ou null = todas no banco
      //   keywords: ['react', 'CTO'],
      //   department: 'engineering',
      //   min_count: 1
      // }
      table.jsonb('filters').notNullable().defaultTo('{}');

      // 'active' | 'paused'
      table.string('status', 20).notNullable().defaultTo('active');

      // Notificação: 'in_app' | 'email' | 'both'
      table.string('notify_via', 20).notNullable().defaultTo('in_app');

      table.timestamp('last_check_at', { useTz: true }).nullable();
      table.integer('total_events_fired').notNullable().defaultTo(0);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('assigned_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'trigger_type']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT_TRIGGER_EVENTS
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('prospect_trigger_events'))) {
    await knex.schema.createTable('prospect_trigger_events', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('trigger_id')
        .notNullable()
        .references('id')
        .inTable('prospect_triggers')
        .onDelete('CASCADE');

      table.uuid('company_id').nullable().references('id').inTable('prospect_companies').onDelete('SET NULL');
      table.uuid('person_id').nullable().references('id').inTable('prospect_people').onDelete('SET NULL');

      table.string('title', 255).notNullable();
      table.text('summary').nullable();
      // Detalhes brutos (ex.: vaga publicada com link).
      table.jsonb('payload').nullable();
      table.string('source_url', 1000).nullable();

      // 'new' | 'seen' | 'acted' | 'dismissed'
      table.string('status', 20).notNullable().defaultTo('new');

      table.timestamp('detected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('seen_at', { useTz: true }).nullable();
      table.timestamp('acted_at', { useTz: true }).nullable();

      table.index(['organization_id', 'status', 'detected_at']);
      table.index(['trigger_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('prospect_trigger_events');
  await knex.schema.dropTableIfExists('prospect_triggers');
  await knex.schema.dropTableIfExists('prospect_sequence_step_executions');
  await knex.schema.dropTableIfExists('prospect_sequence_enrollments');
  await knex.schema.dropTableIfExists('prospect_sequence_steps');
  await knex.schema.dropTableIfExists('prospect_sequences');
  if (await knex.schema.hasColumn('prospect_people', 'fit_score')) {
    await knex.schema.alterTable('prospect_people', (table) => {
      table.dropColumn('fit_score_at');
      table.dropColumn('fit_score_icp_id');
      table.dropColumn('fit_score');
    });
  }
  await knex.schema.dropTableIfExists('prospect_icps');
}

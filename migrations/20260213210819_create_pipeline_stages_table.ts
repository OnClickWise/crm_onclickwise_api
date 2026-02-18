import { Knex } from 'knex';
import { randomUUID } from 'crypto';

export async function up(knex: Knex): Promise<void> {
  // Verificar se a tabela organizations existe
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  
  // Criar tabela de stages customizáveis do pipeline
  await knex.schema.createTable('pipeline_stages', function(table) {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    
    // Dados da stage
    table.string('name', 100).notNullable(); // Nome da stage (para stages customizadas)
    table.string('slug', 100).notNullable(); // Identificador único (ex: "new", "contact", "negociacao")
        table.string('translation_key', 100); // Chave de tradução para stages do sistema (ex: "Pipeline.stages.new")
        table.string('color', 50).notNullable().defaultTo('bg-blue-100 border-blue-200 text-blue-800'); // Classes CSS para cor
        table.integer('order').notNullable().defaultTo(0); // Ordem de exibição
        table.boolean('is_active').notNullable().defaultTo(true); // Se está ativa
    
    // Auditoria
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Índices
    table.index('organization_id');
    table.index(['organization_id', 'slug']);
    table.unique(['organization_id', 'slug']);
  });
  
  // Inserir stages padrão para todas as organizações existentes
  const organizations = await knex('organizations').select('id');
  
      const defaultStages = [
        { 
          name: 'New Leads', // Nome fallback (se não houver tradução)
          slug: 'new', 
          translation_key: 'Pipeline.stages.new', // Chave de tradução
          color: 'bg-blue-100 border-blue-200 text-blue-800', 
          order: 1
        },
        { 
          name: 'In Contact', 
          slug: 'contact', 
          translation_key: 'Pipeline.stages.contact',
          color: 'bg-yellow-100 border-yellow-200 text-yellow-800', 
          order: 2
        },
        { 
          name: 'Qualified', 
          slug: 'qualified', 
          translation_key: 'Pipeline.stages.qualified',
          color: 'bg-green-100 border-green-200 text-green-800', 
          order: 3
        },
        { 
          name: 'Lost', 
          slug: 'lost', 
          translation_key: 'Pipeline.stages.lost',
          color: 'bg-red-100 border-red-200 text-red-800', 
          order: 4
        },
      ];
  
  for (const org of organizations) {
    const stagesToInsert = defaultStages.map(stage => ({
      id: randomUUID(), // Gerar UUID manualmente com crypto nativo
      ...stage,
      organization_id: org.id,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    }));
    
    await knex('pipeline_stages').insert(stagesToInsert);
  }
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('pipeline_stages');
}


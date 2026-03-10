import { config } from 'dotenv';
import knex from 'knex';

config();

const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
});

async function resetDatabase() {
  try {
    console.log('🔄 Resetando banco de dados...');
    
    // Dropar todas as tabelas com CASCADE
    await db.raw('DROP SCHEMA public CASCADE');
    await db.raw('CREATE SCHEMA public');
    await db.raw('GRANT ALL ON SCHEMA public TO postgres');
    await db.raw('GRANT ALL ON SCHEMA public TO public');
    
    console.log('✅ Banco de dados resetado com sucesso!');
    console.log('🚀 Executando migrations...');
    
    // Executar todas as migrations
    await db.migrate.latest();
    
    console.log('✅ Migrations executadas com sucesso!');
    
    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao resetar banco de dados:', error);
    await db.destroy();
    process.exit(1);
  }
}

resetDatabase();

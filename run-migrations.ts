// 1️⃣ SEMPRE carregar env primeiro
import dotenv from 'dotenv';
dotenv.config();

// 2️⃣ só depois importar coisas que dependem do env
import { knexInstance } from '@/shared/config/knex';

async function executarMigracao() {
  console.log('🚀 Iniciando script de migração com ts-node...');

  try {
    console.log('Aplicando as últimas migrações...');
    await knexInstance.migrate.latest();

    console.log('✅ Migrações executadas com SUCESSO!');
  } catch (error) {
    console.error('❌ Erro CRÍTICO ao executar as migrações:', error);
    process.exit(1);
  } finally {
    console.log('🔌 Finalizando conexão...');
    await knexInstance.destroy();
  }
}

executarMigracao();

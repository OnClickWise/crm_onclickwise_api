import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AutoJournalService } from './auto-journal.service';
import { AutoJournalRulesService } from './auto-journal-rules.service';
import { AutoJournalController } from './auto-journal.controller';

/**
 * Auto-Journal — motor de Lançamentos Contábeis Automáticos.
 *
 * Exporta o `AutoJournalService` para que módulos operacionais (Vendas,
 * Compras, Inventário) o injetem e chamem `generate()` nos pontos críticos.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [AutoJournalController],
  providers: [AutoJournalService, AutoJournalRulesService],
  exports: [AutoJournalService, AutoJournalRulesService],
})
export class AutoJournalModule {}

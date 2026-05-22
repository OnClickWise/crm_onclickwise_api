import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { AccountsReceivableService } from './services/accounts-receivable.service';
import { ReceivableRepository } from './repositories/receivable.repository';
import { AutoJournalModule } from '@/modules/accounting/auto-journal/auto-journal.module';

@Module({
  imports: [DatabaseModule, AutoJournalModule],
  controllers: [AccountsReceivableController],
  providers: [AccountsReceivableService, ReceivableRepository],
  exports: [AccountsReceivableService, ReceivableRepository],
})
export class AccountsReceivableModule {}

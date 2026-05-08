import { Module } from '@nestjs/common';
import { JournalEntriesModule } from './journal-entries/journal-entries.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { ReportsModule } from './reports/reports.module';
import { SeedModule } from './seed/seed.module';
import { JournalsModule } from './journals/journals.module';
import { ExportsModule } from './exports/exports.module';

@Module({
  imports: [
    JournalEntriesModule,
    ChartOfAccountsModule,
    ReportsModule,
    SeedModule,
    JournalsModule,
    ExportsModule,
  ],
  exports: [
    JournalEntriesModule,
    ChartOfAccountsModule,
    ReportsModule,
    JournalsModule,
    ExportsModule,
  ],
})
export class AccountingModule {}

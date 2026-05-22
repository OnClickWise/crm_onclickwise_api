import { Module } from '@nestjs/common';
import { JournalEntriesModule } from './journal-entries/journal-entries.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { ReportsModule } from './reports/reports.module';
import { SeedModule } from './seed/seed.module';
import { JournalsModule } from './journals/journals.module';
import { ExportsModule } from './exports/exports.module';
import { AutoJournalModule } from './auto-journal/auto-journal.module';
import { FiscalYearModule } from './fiscal-year/fiscal-year.module';

@Module({
  imports: [
    JournalEntriesModule,
    ChartOfAccountsModule,
    ReportsModule,
    SeedModule,
    JournalsModule,
    ExportsModule,
    AutoJournalModule,
    FiscalYearModule,
  ],
  exports: [
    JournalEntriesModule,
    ChartOfAccountsModule,
    ReportsModule,
    JournalsModule,
    ExportsModule,
    AutoJournalModule,
    FiscalYearModule,
  ],
})
export class AccountingModule {}

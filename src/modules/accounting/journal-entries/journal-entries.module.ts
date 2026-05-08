import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { JournalEntriesController } from './journal-entries.controller';
import { AccountingService } from './services/accounting.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JournalEntriesController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class JournalEntriesModule {}

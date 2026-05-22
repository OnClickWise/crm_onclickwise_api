import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { FiscalYearService } from './fiscal-year.service';
import { FiscalYearController } from './fiscal-year.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [FiscalYearController],
  providers: [FiscalYearService],
  exports: [FiscalYearService],
})
export class FiscalYearModule {}

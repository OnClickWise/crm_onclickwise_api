import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}

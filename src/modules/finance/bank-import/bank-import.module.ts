import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AccountsReceivableModule } from '../accounts-receivable/accounts-receivable.module';
import { AccountsPayableModule } from '../accounts-payable/accounts-payable.module';
import { BankImportService } from './bank-import.service';
import { BankImportController } from './bank-import.controller';

/**
 * Bank Import — importação de extratos OFX/CSV com auto-conciliação contra
 * Contas a Receber / Contas a Pagar. Reusa os serviços de AR/AP para
 * registrar os pagamentos (que disparam os lançamentos contábeis da Fase 1).
 */
@Module({
  imports: [DatabaseModule, AccountsReceivableModule, AccountsPayableModule],
  controllers: [BankImportController],
  providers: [BankImportService],
  exports: [BankImportService],
})
export class BankImportModule {}

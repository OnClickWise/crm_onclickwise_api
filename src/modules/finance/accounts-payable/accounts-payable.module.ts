import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AccountsPayableController } from './accounts-payable.controller';
import { AccountsPayableService } from './services/accounts-payable.service';
import { PayableRepository } from './repositories/payable.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [AccountsPayableController],
  providers: [AccountsPayableService, PayableRepository],
  exports: [AccountsPayableService, PayableRepository],
})
export class AccountsPayableModule {}

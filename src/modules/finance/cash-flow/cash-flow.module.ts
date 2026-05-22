import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { CashFlowService } from './cash-flow.service';
import { CashFlowController } from './cash-flow.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}

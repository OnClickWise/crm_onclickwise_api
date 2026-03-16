import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { FinancialFlowController } from './financial-flow.controller';
import { FinancialFlowService } from './services/financial-flow.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FinancialFlowController],
  providers: [FinancialFlowService],
  exports: [FinancialFlowService],
})
export class FinancialFlowModule {}
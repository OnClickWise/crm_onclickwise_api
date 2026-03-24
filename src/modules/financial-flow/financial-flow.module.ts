import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { FinancialFlowController } from './financial-flow.controller';
import { FinancialFlowService } from './services/financial-flow.service';
import { CreateFinancialFlowUseCase } from '@/use-cases/financial-flow/create-financial-flow.useCase';
import { ListFinancialFlowsUseCase } from '@/use-cases/financial-flow/list-financial-flows.useCase';
import { UpdateFinancialFlowUseCase } from '@/use-cases/financial-flow/update-financial-flow.useCase';
import { DeleteFinancialFlowUseCase } from '@/use-cases/financial-flow/delete-financial-flow.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [FinancialFlowController],
  providers: [
    FinancialFlowService,
    CreateFinancialFlowUseCase,
    ListFinancialFlowsUseCase,
    UpdateFinancialFlowUseCase,
    DeleteFinancialFlowUseCase,
  ],
  exports: [FinancialFlowService],
})
export class FinancialFlowModule {}
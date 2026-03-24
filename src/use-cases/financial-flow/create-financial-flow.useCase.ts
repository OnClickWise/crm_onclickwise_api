import { Injectable } from '@nestjs/common';
import { FinancialFlowService } from '@/modules/financial-flow/services/financial-flow.service';

@Injectable()
export class CreateFinancialFlowUseCase {
  constructor(private readonly financialFlowService: FinancialFlowService) {}

  async execute(data: any, user: any) {
    return this.financialFlowService.createFlow(data, user);
  }
}

import { Injectable } from '@nestjs/common';
import { FinancialFlowService } from '@/modules/financial-flow/services/financial-flow.service';

@Injectable()
export class ListFinancialFlowsUseCase {
  constructor(private readonly financialFlowService: FinancialFlowService) {}

  async execute(user: any) {
    return this.financialFlowService.listFlows(user);
  }
}

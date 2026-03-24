import { Injectable } from '@nestjs/common';
import { FinancialFlowService } from '@/modules/financial-flow/services/financial-flow.service';

@Injectable()
export class UpdateFinancialFlowUseCase {
  constructor(private readonly financialFlowService: FinancialFlowService) {}

  async execute(id: string, data: any, user: any) {
    return this.financialFlowService.updateFlow(id, data, user);
  }
}

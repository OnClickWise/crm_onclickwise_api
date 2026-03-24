import { Injectable } from '@nestjs/common';
import { FinancialFlowService } from '@/modules/financial-flow/services/financial-flow.service';

@Injectable()
export class DeleteFinancialFlowUseCase {
  constructor(private readonly financialFlowService: FinancialFlowService) {}

  async execute(id: string, user: any) {
    return this.financialFlowService.deleteFlow(id, user);
  }
}

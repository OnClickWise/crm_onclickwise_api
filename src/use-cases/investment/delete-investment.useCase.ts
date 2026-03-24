import { Injectable } from '@nestjs/common';
import { InvestmentService } from '@/modules/investment/services/investment.service';

@Injectable()
export class DeleteInvestmentUseCase {
  constructor(private readonly investmentService: InvestmentService) {}

  async execute(id: string, user: any) {
    return this.investmentService.deleteInvestment(id, user);
  }
}

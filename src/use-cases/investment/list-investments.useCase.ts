import { Injectable } from '@nestjs/common';
import { InvestmentService } from '@/modules/investment/services/investment.service';

@Injectable()
export class ListInvestmentsUseCase {
  constructor(private readonly investmentService: InvestmentService) {}

  async execute(portfolioId: string | undefined, user: any) {
    return this.investmentService.listInvestments(portfolioId, user);
  }
}

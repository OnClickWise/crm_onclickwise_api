import { Injectable } from '@nestjs/common';
import { InvestmentService } from '@/modules/investment/services/investment.service';

@Injectable()
export class RefreshInvestmentPricesUseCase {
  constructor(private readonly investmentService: InvestmentService) {}

  async execute(user: any) {
    return this.investmentService.refreshPrices(user);
  }
}

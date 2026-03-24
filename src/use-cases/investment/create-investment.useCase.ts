import { Injectable } from '@nestjs/common';
import { InvestmentService } from '@/modules/investment/services/investment.service';

@Injectable()
export class CreateInvestmentUseCase {
  constructor(private readonly investmentService: InvestmentService) {}

  async execute(data: any, user: any) {
    return this.investmentService.createInvestment(data, user);
  }
}

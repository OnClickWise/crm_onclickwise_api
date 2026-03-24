import { Injectable } from '@nestjs/common';
import { InvestmentService } from '@/modules/investment/services/investment.service';

@Injectable()
export class UpdateInvestmentUseCase {
  constructor(private readonly investmentService: InvestmentService) {}

  async execute(id: string, data: any, user: any) {
    return this.investmentService.updateInvestment(id, data, user);
  }
}

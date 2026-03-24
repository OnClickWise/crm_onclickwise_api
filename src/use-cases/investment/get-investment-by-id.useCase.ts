import { Injectable } from '@nestjs/common';
import { InvestmentService } from '@/modules/investment/services/investment.service';

@Injectable()
export class GetInvestmentByIdUseCase {
  constructor(private readonly investmentService: InvestmentService) {}

  async execute(id: string, user: any) {
    return this.investmentService.getInvestmentById(id, user);
  }
}

import { Injectable } from '@nestjs/common';
import { InvestorService } from '@/modules/investor/services/investor.service';

@Injectable()
export class CreateInvestorUseCase {
  constructor(private readonly investorService: InvestorService) {}

  async execute(data: any, user: any) {
    return this.investorService.createInvestor(data, user);
  }
}

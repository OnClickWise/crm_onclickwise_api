import { Injectable } from '@nestjs/common';
import { InvestorService } from '@/modules/investor/services/investor.service';

@Injectable()
export class ListInvestorsUseCase {
  constructor(private readonly investorService: InvestorService) {}

  async execute(user: any) {
    return this.investorService.listInvestors(user);
  }
}

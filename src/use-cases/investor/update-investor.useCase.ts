import { Injectable } from '@nestjs/common';
import { InvestorService } from '@/modules/investor/services/investor.service';

@Injectable()
export class UpdateInvestorUseCase {
  constructor(private readonly investorService: InvestorService) {}

  async execute(id: string, data: any, user: any) {
    return this.investorService.updateInvestor(id, data, user);
  }
}

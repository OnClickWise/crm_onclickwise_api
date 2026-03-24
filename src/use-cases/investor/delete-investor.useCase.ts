import { Injectable } from '@nestjs/common';
import { InvestorService } from '@/modules/investor/services/investor.service';

@Injectable()
export class DeleteInvestorUseCase {
  constructor(private readonly investorService: InvestorService) {}

  async execute(id: string, user: any) {
    return this.investorService.deleteInvestor(id, user);
  }
}

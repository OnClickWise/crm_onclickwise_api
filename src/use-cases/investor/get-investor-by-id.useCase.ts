import { Injectable } from '@nestjs/common';
import { InvestorService } from '@/modules/investor/services/investor.service';

@Injectable()
export class GetInvestorByIdUseCase {
  constructor(private readonly investorService: InvestorService) {}

  async execute(id: string, user: any) {
    return this.investorService.getInvestorById(id, user);
  }
}

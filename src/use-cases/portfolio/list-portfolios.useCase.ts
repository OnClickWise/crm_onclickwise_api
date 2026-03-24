import { Injectable } from '@nestjs/common';
import { PortfolioService } from '@/modules/portfolio/services/portfolio.service';

@Injectable()
export class ListPortfoliosUseCase {
  constructor(private readonly portfolioService: PortfolioService) {}

  async execute(investorId: string | undefined, user: any) {
    return this.portfolioService.listPortfolios(investorId, user);
  }
}

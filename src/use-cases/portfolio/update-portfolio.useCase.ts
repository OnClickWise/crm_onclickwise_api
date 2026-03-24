import { Injectable } from '@nestjs/common';
import { PortfolioService } from '@/modules/portfolio/services/portfolio.service';

@Injectable()
export class UpdatePortfolioUseCase {
  constructor(private readonly portfolioService: PortfolioService) {}

  async execute(id: string, data: any, user: any) {
    return this.portfolioService.updatePortfolio(id, data, user);
  }
}

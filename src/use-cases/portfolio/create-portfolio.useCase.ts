import { Injectable } from '@nestjs/common';
import { PortfolioService } from '@/modules/portfolio/services/portfolio.service';

@Injectable()
export class CreatePortfolioUseCase {
  constructor(private readonly portfolioService: PortfolioService) {}

  async execute(data: any, user: any) {
    return this.portfolioService.createPortfolio(data, user);
  }
}

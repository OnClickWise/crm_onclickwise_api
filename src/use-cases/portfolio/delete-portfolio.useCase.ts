import { Injectable } from '@nestjs/common';
import { PortfolioService } from '@/modules/portfolio/services/portfolio.service';

@Injectable()
export class DeletePortfolioUseCase {
  constructor(private readonly portfolioService: PortfolioService) {}

  async execute(id: string, user: any) {
    return this.portfolioService.deletePortfolio(id, user);
  }
}

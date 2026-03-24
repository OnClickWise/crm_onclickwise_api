import { Injectable } from '@nestjs/common';
import { PortfolioService } from '@/modules/portfolio/services/portfolio.service';

@Injectable()
export class DeletePortfolioCascadeUseCase {
  constructor(private readonly portfolioService: PortfolioService) {}

  async execute(id: string, user: any) {
    return this.portfolioService.deletePortfolioCascade(id, user);
  }
}

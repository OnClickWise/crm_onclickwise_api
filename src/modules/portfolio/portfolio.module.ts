import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './services/portfolio.service';
import { CreatePortfolioUseCase } from '@/use-cases/portfolio/create-portfolio.useCase';
import { ListPortfoliosUseCase } from '@/use-cases/portfolio/list-portfolios.useCase';
import { GetPortfolioByIdUseCase } from '@/use-cases/portfolio/get-portfolio-by-id.useCase';
import { UpdatePortfolioUseCase } from '@/use-cases/portfolio/update-portfolio.useCase';
import { DeletePortfolioUseCase } from '@/use-cases/portfolio/delete-portfolio.useCase';
import { DeletePortfolioCascadeUseCase } from '@/use-cases/portfolio/delete-portfolio-cascade.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    CreatePortfolioUseCase,
    ListPortfoliosUseCase,
    GetPortfolioByIdUseCase,
    UpdatePortfolioUseCase,
    DeletePortfolioUseCase,
    DeletePortfolioCascadeUseCase,
  ],
  exports: [PortfolioService],
})
export class PortfolioModule {}

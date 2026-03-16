import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './services/portfolio.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}

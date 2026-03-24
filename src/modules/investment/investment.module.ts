import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { CacheModule } from '@/shared/cache/cache.module';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './services/investment.service';
import { PriceSchedulerService } from './services/price-scheduler.service';
import { CreateInvestmentUseCase } from '@/use-cases/investment/create-investment.useCase';
import { ListInvestmentsUseCase } from '@/use-cases/investment/list-investments.useCase';
import { GetInvestmentByIdUseCase } from '@/use-cases/investment/get-investment-by-id.useCase';
import { UpdateInvestmentUseCase } from '@/use-cases/investment/update-investment.useCase';
import { DeleteInvestmentUseCase } from '@/use-cases/investment/delete-investment.useCase';
import { RefreshInvestmentPricesUseCase } from '@/use-cases/investment/refresh-investment-prices.useCase';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [InvestmentController],
  providers: [
    InvestmentService,
    PriceSchedulerService,
    CreateInvestmentUseCase,
    ListInvestmentsUseCase,
    GetInvestmentByIdUseCase,
    UpdateInvestmentUseCase,
    DeleteInvestmentUseCase,
    RefreshInvestmentPricesUseCase,
  ],
  exports: [InvestmentService],
})
export class InvestmentModule {}

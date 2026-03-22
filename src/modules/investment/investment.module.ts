import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { CacheModule } from '@/shared/cache/cache.module';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './services/investment.service';
import { PriceSchedulerService } from './services/price-scheduler.service';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [InvestmentController],
  providers: [InvestmentService, PriceSchedulerService],
  exports: [InvestmentService],
})
export class InvestmentModule {}

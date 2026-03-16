import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './services/investment.service';
import { PriceSchedulerService } from './services/price-scheduler.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InvestmentController],
  providers: [InvestmentService, PriceSchedulerService],
  exports: [InvestmentService],
})
export class InvestmentModule {}

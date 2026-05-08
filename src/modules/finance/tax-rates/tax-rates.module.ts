import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { TaxRatesService } from './tax-rates.service';
import { TaxRatesController } from './tax-rates.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [TaxRatesController],
  providers: [TaxRatesService],
  exports: [TaxRatesService],
})
export class TaxRatesModule {}

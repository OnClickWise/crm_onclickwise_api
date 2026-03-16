import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { InvestorController } from './investor.controller';
import { InvestorService } from './services/investor.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InvestorController],
  providers: [InvestorService],
  exports: [InvestorService],
})
export class InvestorModule {}

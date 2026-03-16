import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { DividendController } from './dividend.controller';
import { DividendService } from './services/dividend.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DividendController],
  providers: [DividendService],
  exports: [DividendService],
})
export class DividendModule {}
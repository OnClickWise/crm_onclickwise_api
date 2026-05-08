import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { FinanceConfigService } from './finance-config.service';
import { FinanceConfigController } from './finance-config.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [FinanceConfigController],
  providers: [FinanceConfigService],
  exports: [FinanceConfigService],
})
export class FinanceConfigModule {}

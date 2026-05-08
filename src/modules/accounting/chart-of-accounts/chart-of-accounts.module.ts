import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { ChartOfAccountsController } from './chart-of-accounts.controller';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChartOfAccountsController],
  providers: [ChartOfAccountsService],
  exports: [ChartOfAccountsService],
})
export class ChartOfAccountsModule {}
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { DividendController } from './dividend.controller';
import { DividendService } from './services/dividend.service';
import { CreateDividendUseCase } from '@/use-cases/dividend/create-dividend.useCase';
import { ListDividendsUseCase } from '@/use-cases/dividend/list-dividends.useCase';
import { UpdateDividendUseCase } from '@/use-cases/dividend/update-dividend.useCase';
import { DeleteDividendUseCase } from '@/use-cases/dividend/delete-dividend.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [DividendController],
  providers: [
    DividendService,
    CreateDividendUseCase,
    ListDividendsUseCase,
    UpdateDividendUseCase,
    DeleteDividendUseCase,
  ],
  exports: [DividendService],
})
export class DividendModule {}
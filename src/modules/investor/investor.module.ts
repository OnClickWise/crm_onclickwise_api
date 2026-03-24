import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { InvestorController } from './investor.controller';
import { InvestorService } from './services/investor.service';
import { CreateInvestorUseCase } from '@/use-cases/investor/create-investor.useCase';
import { ListInvestorsUseCase } from '@/use-cases/investor/list-investors.useCase';
import { GetInvestorByIdUseCase } from '@/use-cases/investor/get-investor-by-id.useCase';
import { UpdateInvestorUseCase } from '@/use-cases/investor/update-investor.useCase';
import { DeleteInvestorUseCase } from '@/use-cases/investor/delete-investor.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [InvestorController],
  providers: [
    InvestorService,
    CreateInvestorUseCase,
    ListInvestorsUseCase,
    GetInvestorByIdUseCase,
    UpdateInvestorUseCase,
    DeleteInvestorUseCase,
  ],
  exports: [InvestorService],
})
export class InvestorModule {}

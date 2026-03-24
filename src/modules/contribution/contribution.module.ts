import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { ContributionController } from './contribution.controller';
import { ContributionService } from './services/contribution.service';
import { CreateContributionUseCase } from '@/use-cases/contribution/create-contribution.useCase';
import { ListContributionsUseCase } from '@/use-cases/contribution/list-contributions.useCase';
import { UpdateContributionUseCase } from '@/use-cases/contribution/update-contribution.useCase';
import { DeleteContributionUseCase } from '@/use-cases/contribution/delete-contribution.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [ContributionController],
  providers: [
    ContributionService,
    CreateContributionUseCase,
    ListContributionsUseCase,
    UpdateContributionUseCase,
    DeleteContributionUseCase,
  ],
  exports: [ContributionService],
})
export class ContributionModule {}
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { ContributionController } from './contribution.controller';
import { ContributionService } from './services/contribution.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContributionController],
  providers: [ContributionService],
  exports: [ContributionService],
})
export class ContributionModule {}
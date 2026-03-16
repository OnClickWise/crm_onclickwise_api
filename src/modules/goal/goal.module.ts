import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { GoalController } from './goal.controller';
import { GoalService } from './services/goal.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GoalController],
  providers: [GoalService],
  exports: [GoalService],
})
export class GoalModule {}
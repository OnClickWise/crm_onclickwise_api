import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { GoalController } from './goal.controller';
import { GoalService } from './services/goal.service';
import { CreateGoalUseCase } from '@/use-cases/goal/create-goal.useCase';
import { ListGoalsUseCase } from '@/use-cases/goal/list-goals.useCase';
import { UpdateGoalUseCase } from '@/use-cases/goal/update-goal.useCase';
import { DeleteGoalUseCase } from '@/use-cases/goal/delete-goal.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [GoalController],
  providers: [
    GoalService,
    CreateGoalUseCase,
    ListGoalsUseCase,
    UpdateGoalUseCase,
    DeleteGoalUseCase,
  ],
  exports: [GoalService],
})
export class GoalModule {}
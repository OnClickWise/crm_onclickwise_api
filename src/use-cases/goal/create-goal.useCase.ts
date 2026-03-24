import { Injectable } from '@nestjs/common';
import { GoalService } from '@/modules/goal/services/goal.service';

@Injectable()
export class CreateGoalUseCase {
  constructor(private readonly goalService: GoalService) {}

  async execute(data: any, user: any) {
    return this.goalService.createGoal(data, user);
  }
}

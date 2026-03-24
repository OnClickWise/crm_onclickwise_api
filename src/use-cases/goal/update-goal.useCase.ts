import { Injectable } from '@nestjs/common';
import { GoalService } from '@/modules/goal/services/goal.service';

@Injectable()
export class UpdateGoalUseCase {
  constructor(private readonly goalService: GoalService) {}

  async execute(id: string, data: any, user: any) {
    return this.goalService.updateGoal(id, data, user);
  }
}

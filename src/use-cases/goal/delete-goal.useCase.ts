import { Injectable } from '@nestjs/common';
import { GoalService } from '@/modules/goal/services/goal.service';

@Injectable()
export class DeleteGoalUseCase {
  constructor(private readonly goalService: GoalService) {}

  async execute(id: string, user: any) {
    return this.goalService.deleteGoal(id, user);
  }
}

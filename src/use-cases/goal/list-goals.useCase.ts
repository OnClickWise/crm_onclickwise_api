import { Injectable } from '@nestjs/common';
import { GoalService } from '@/modules/goal/services/goal.service';

@Injectable()
export class ListGoalsUseCase {
  constructor(private readonly goalService: GoalService) {}

  async execute(user: any) {
    return this.goalService.listGoals(user);
  }
}

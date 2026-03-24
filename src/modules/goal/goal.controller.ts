import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateGoalUseCase } from '@/use-cases/goal/create-goal.useCase';
import { ListGoalsUseCase } from '@/use-cases/goal/list-goals.useCase';
import { UpdateGoalUseCase } from '@/use-cases/goal/update-goal.useCase';
import { DeleteGoalUseCase } from '@/use-cases/goal/delete-goal.useCase';

@Controller('financial-goals')
export class GoalController {
  constructor(
    private readonly createGoalUseCase: CreateGoalUseCase,
    private readonly listGoalsUseCase: ListGoalsUseCase,
    private readonly updateGoalUseCase: UpdateGoalUseCase,
    private readonly deleteGoalUseCase: DeleteGoalUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createGoalUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.listGoalsUseCase.execute(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateGoalUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteGoalUseCase.execute(id, req.user);
  }
}
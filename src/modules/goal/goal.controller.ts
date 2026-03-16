import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { GoalService } from './services/goal.service';

@Controller('financial-goals')
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.goalService.createGoal(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.goalService.listGoals(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.goalService.updateGoal(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.goalService.deleteGoal(id, req.user);
  }
}
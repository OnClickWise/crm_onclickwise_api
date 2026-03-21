import { Controller, Post, Get, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { CreateProjectUseCase } from '../../use-cases/project/createProject.useCase';
import { ListProjectsUseCase } from '../../use-cases/project/listProjects.useCase';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { GetProjectByIdUseCase } from '../../use-cases/project/getProjectById.useCase';
import { UpdateProjectUseCase } from '../../use-cases/project/updateProject.useCase';
import { DeleteProjectUseCase } from '../../use-cases/project/deleteProject.useCase';
import { ProjectService } from './services/project.service';

@Controller('projects')
export class ProjectController {
  constructor(
    private createProject: CreateProjectUseCase,
    private listProjects: ListProjectsUseCase,
    private getProjectById: GetProjectByIdUseCase,
    private updateProject: UpdateProjectUseCase,
    private deleteProject: DeleteProjectUseCase,
    private projectService: ProjectService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('available-users')
  async getAvailableUsers(@Request() req: any) {
    const users = await this.projectService.listOrganizationUsers(req.user);
    return { success: true, users };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getProjectById.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateProject.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteProject.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createProject.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.listProjects.execute(req.user);
  }
}

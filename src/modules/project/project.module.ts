import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { ProjectController } from './project.controller';
import { CreateProjectUseCase } from '../../use-cases/project/createProject.useCase';
import { ListProjectsUseCase } from '../../use-cases/project/listProjects.useCase';
import { GetProjectByIdUseCase } from '../../use-cases/project/getProjectById.useCase';
import { UpdateProjectUseCase } from '../../use-cases/project/updateProject.useCase';
import { DeleteProjectUseCase } from '../../use-cases/project/deleteProject.useCase';
import { ProjectService } from './services/project.service';
import { ListProjectAvailableUsersUseCase } from '@/use-cases/project/list-project-available-users.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectController],
  providers: [
    CreateProjectUseCase,
    ListProjectsUseCase,
    GetProjectByIdUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    ListProjectAvailableUsersUseCase,
    ProjectService,
  ],
})
export class ProjectModule {}

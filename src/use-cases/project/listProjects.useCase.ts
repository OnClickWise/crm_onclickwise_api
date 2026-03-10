import { Injectable } from '@nestjs/common';
import { ProjectService } from '@/modules/project/services/project.service';

@Injectable()
export class ListProjectsUseCase {
  constructor(private readonly projectService: ProjectService) {}

  async execute(user: any) {
    return this.projectService.listProjects(user);
  }
}

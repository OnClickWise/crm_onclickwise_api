import { Injectable } from '@nestjs/common';
import { ProjectService } from '@/modules/project/services/project.service';

@Injectable()
export class CreateProjectUseCase {
  constructor(private readonly projectService: ProjectService) {}

  async execute(data: any, user: any) {
    return this.projectService.createProject(data, user);
  }
}

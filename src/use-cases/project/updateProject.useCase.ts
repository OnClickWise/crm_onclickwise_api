import { Injectable } from '@nestjs/common';
import { ProjectService } from '@/modules/project/services/project.service';

@Injectable()
export class UpdateProjectUseCase {
  constructor(private readonly projectService: ProjectService) {}

  async execute(id: string, data: any, user: any) {
    return this.projectService.updateProject(id, data, user);
  }
}

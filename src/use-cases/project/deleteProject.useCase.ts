import { Injectable } from '@nestjs/common';
import { ProjectService } from '@/modules/project/services/project.service';

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly projectService: ProjectService) {}

  async execute(id: string, user: any) {
    return this.projectService.deleteProject(id, user);
  }
}

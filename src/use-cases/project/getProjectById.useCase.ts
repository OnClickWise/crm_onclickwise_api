import { Injectable } from '@nestjs/common';
import { ProjectService } from '@/modules/project/services/project.service';

@Injectable()
export class GetProjectByIdUseCase {
  constructor(private readonly projectService: ProjectService) {}

  async execute(id: string, user: any) {
    return this.projectService.getProjectById(id, user);
  }
}

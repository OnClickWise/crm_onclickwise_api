import { Injectable } from '@nestjs/common';
import { ProjectService } from '@/modules/project/services/project.service';

@Injectable()
export class ListProjectAvailableUsersUseCase {
  constructor(private readonly projectService: ProjectService) {}

  async execute(user: any) {
    const users = await this.projectService.listOrganizationUsers(user);
    return { success: true, users };
  }
}

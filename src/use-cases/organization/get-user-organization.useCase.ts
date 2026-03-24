import { Injectable } from '@nestjs/common';
import { OrganizationService } from '@/modules/organization/organization.service';

@Injectable()
export class GetUserOrganizationUseCase {
  constructor(private readonly organizationService: OrganizationService) {}

  async execute(userId: string) {
    return this.organizationService.findByUserId(userId);
  }
}

import { Injectable } from '@nestjs/common';
import { OrganizationService } from '@/modules/organization/organization.service';

@Injectable()
export class UpdateOrganizationUseCase {
  constructor(private readonly organizationService: OrganizationService) {}

  async execute(organizationId: string, data: any) {
    return this.organizationService.update(organizationId, data);
  }
}

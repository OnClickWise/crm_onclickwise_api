import { Injectable } from '@nestjs/common';
import { OrganizationService } from '@/modules/organization/organization.service';
import { UpdateOrganizationDto } from '@/modules/organization/dtos/update-organization.dto';

@Injectable()
export class UpdateOrganizationUseCase {
  constructor(private readonly organizationService: OrganizationService) {}

  async execute(organizationId: string, data: UpdateOrganizationDto) {
    return this.organizationService.update(organizationId, data);
  }
}

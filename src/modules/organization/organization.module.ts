import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { DatabaseModule } from '@/shared/database/database.module';
import { GetUserOrganizationUseCase } from '@/use-cases/organization/get-user-organization.useCase';
import { UpdateOrganizationUseCase } from '@/use-cases/organization/update-organization.useCase';
import { UploadOrganizationLogoUseCase } from '@/use-cases/organization/upload-organization-logo.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    GetUserOrganizationUseCase,
    UpdateOrganizationUseCase,
    UploadOrganizationLogoUseCase,
  ],
  exports: [OrganizationService],
})
export class OrganizationModule {}

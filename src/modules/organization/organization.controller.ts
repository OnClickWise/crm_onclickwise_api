import {
  Controller,
  Patch,
  Put,
  Get,
  UseGuards,
  Req,
  Body,
  BadRequestException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUserOrganizationUseCase } from '@/use-cases/organization/get-user-organization.useCase';
import { UpdateOrganizationUseCase } from '@/use-cases/organization/update-organization.useCase';
import { UploadOrganizationLogoUseCase } from '@/use-cases/organization/upload-organization-logo.useCase';

@Controller('organization')
export class OrganizationController {
  private readonly logger = new Logger(OrganizationController.name);
  constructor(
    private readonly getUserOrganizationUseCase: GetUserOrganizationUseCase,
    private readonly updateOrganizationUseCase: UpdateOrganizationUseCase,
    private readonly uploadOrganizationLogoUseCase: UploadOrganizationLogoUseCase,
  ) {}

  @Get('user-organization')
  @UseGuards(JwtAuthGuard)
  async getUserOrganization(@Req() req) {
    try {
      const organization = await this.getUserOrganizationUseCase.execute(
        req.user.userId,
      );
      return {
        success: true,
        organization,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Put('update')
  @UseGuards(JwtAuthGuard)
  async updateOrganization(@Req() req, @Body() body: any) {
    try {
      const organizationId = req.user.organizationId;
      const updatedOrganization = await this.updateOrganizationUseCase.execute(
        organizationId,
        body,
      );
      return {
        success: true,
        organization: updatedOrganization,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Patch('logo')
  @UseGuards(JwtAuthGuard)
  async uploadLogo(@Req() req) {
    try {
      const data = await req.file();
      return this.uploadOrganizationLogoUseCase.execute(req.user.organizationId, data);
    } catch (error) {
      this.logger.error(`Erro ao fazer upload do logo: ${error.message}`);
      
      if (
        error?.code === 'FST_REQ_FILE_TOO_LARGE' ||
        error?.message?.includes('File too large')
      ) {
        throw new PayloadTooLargeException('Arquivo muito grande (máx 5MB)');
      }

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao fazer upload do logo');
    }
  }
}

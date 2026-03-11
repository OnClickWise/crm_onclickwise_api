import {
  Controller,
  Patch,
  Put,
  Get,
  UseGuards,
  Req,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationService } from './organization.service';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('user-organization')
  @UseGuards(JwtAuthGuard)
  async getUserOrganization(@Req() req) {
    try {
      const organization = await this.organizationService.findByUserId(
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
      const updatedOrganization = await this.organizationService.update(
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
      // Obter o arquivo do multipart
      const data = await req.file();
      
      if (!data) {
        throw new BadRequestException('Arquivo não enviado');
      }

      // Validar tipo de arquivo
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        throw new BadRequestException('Tipo de arquivo inválido');
      }

      // Validar tamanho (max 5MB)
      const buffer = await data.toBuffer();
      if (buffer.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Arquivo muito grande (máx 5MB)');
      }

      // Criar pasta uploads/logos se não existir
      const uploadsDir = join(process.cwd(), 'uploads', 'logos');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      // Gerar nome único para o arquivo
      const ext = data.filename.split('.').pop();
      const uniqueFilename = `${randomUUID()}.${ext}`;
      const filePath = join(uploadsDir, uniqueFilename);

      // Salvar arquivo
      await writeFile(filePath, buffer);

      // Atualizar logo_url no banco
      const organizationId = req.user.organizationId;
      const logoUrl = `/uploads/logos/${uniqueFilename}`;
      await this.organizationService.updateLogo(organizationId, logoUrl);

      return {
        success: true,
        logo_url: logoUrl,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao fazer upload do logo');
    }
  }
}

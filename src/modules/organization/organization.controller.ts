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
import { OrganizationService } from './organization.service';
import { env } from '@/shared/config/env';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('organization')
export class OrganizationController {
  private readonly logger = new Logger(OrganizationController.name);
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

      // Usar variável de ambiente UPLOADS_DIR (configurável em produção)
      const uploadsDir = join(env.UPLOADS_DIR, 'logos');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
        this.logger.log(`Diretório criado: ${uploadsDir}`);
      }

      // Gerar nome único para o arquivo
      const ext = data.filename.split('.').pop();
      const uniqueFilename = `${randomUUID()}.${ext}`;
      const filePath = join(uploadsDir, uniqueFilename);

      // Salvar arquivo
      await writeFile(filePath, buffer);
      this.logger.log(`Logo salvo: ${filePath}`);

      // Atualizar logo_url no banco
      const organizationId = req.user.organizationId;
      const logoUrl = `/uploads/logos/${uniqueFilename}`;
      await this.organizationService.updateLogo(organizationId, logoUrl);

      return {
        success: true,
        logo_url: logoUrl,
      };
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

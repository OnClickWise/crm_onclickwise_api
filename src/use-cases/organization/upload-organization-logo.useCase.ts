import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { env } from '@/shared/config/env';
import { OrganizationService } from '@/modules/organization/organization.service';

@Injectable()
export class UploadOrganizationLogoUseCase {
  constructor(private readonly organizationService: OrganizationService) {}

  async execute(organizationId: string, data: any) {
    try {
      if (!data) {
        throw new BadRequestException('Arquivo não enviado');
      }

      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        throw new BadRequestException('Tipo de arquivo inválido');
      }

      const buffer = await data.toBuffer();
      if (buffer.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Arquivo muito grande (máx 5MB)');
      }

      const uploadsDir = join(env.UPLOADS_DIR, 'logos');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      const ext = data.filename.split('.').pop();
      const uniqueFilename = `${randomUUID()}.${ext}`;
      const filePath = join(uploadsDir, uniqueFilename);

      await writeFile(filePath, buffer);

      const logoUrl = `/uploads/logos/${uniqueFilename}`;
      await this.organizationService.updateLogo(organizationId, logoUrl);

      return {
        success: true,
        logo_url: logoUrl,
      };
    } catch (error) {
      if (
        error?.code === 'FST_REQ_FILE_TOO_LARGE' ||
        error?.message?.includes('File too large')
      ) {
        throw new PayloadTooLargeException('Arquivo muito grande (máx 5MB)');
      }

      if (error instanceof BadRequestException || error instanceof PayloadTooLargeException) {
        throw error;
      }

      throw new BadRequestException('Erro ao fazer upload do logo');
    }
  }
}

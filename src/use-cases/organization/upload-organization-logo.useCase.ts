import { BadRequestException, Injectable, PayloadTooLargeException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync, statSync } from 'fs';
import { env } from '@/shared/config/env';
import { OrganizationService } from '@/modules/organization/organization.service';

@Injectable()
export class UploadOrganizationLogoUseCase {
  private readonly logger = new Logger(UploadOrganizationLogoUseCase.name);

  constructor(private readonly organizationService: OrganizationService) {}

  async execute(organizationId: string, data: any) {
    try {
      if (!data) {
        throw new BadRequestException('Arquivo não enviado');
      }

      this.logger.debug(`[UPLOAD] Iniciando upload. Filename: ${data.filename}, Mimetype: ${data.mimetype}`);

      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        throw new BadRequestException(`Tipo de arquivo inválido: ${data.mimetype}`);
      }

      const buffer = await data.toBuffer();
      if (buffer.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Arquivo muito grande (máx 5MB)');
      }

      const uploadsDir = join(env.UPLOADS_DIR, 'logos');
      this.logger.debug(`[UPLOAD] Diretório de uploads: ${uploadsDir}`);

      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
        this.logger.log(`[UPLOAD] Diretório criado: ${uploadsDir}`);
      }

      // Extrair extensão com segurança
      let ext = 'jpg'; // fallback padrão
      if (data.filename && data.filename.includes('.')) {
        const extractedExt = data.filename.split('.').pop()?.toLowerCase();
        if (extractedExt && extractedExt.length <= 5) {
          ext = extractedExt;
        }
      }

      const uniqueFilename = `${randomUUID()}.${ext}`;
      const filePath = join(uploadsDir, uniqueFilename);

      this.logger.debug(`[UPLOAD] Tentando salvar em: ${filePath}`);

      await writeFile(filePath, buffer);

      // Validar que o arquivo foi realmente salvo
      if (!existsSync(filePath)) {
        throw new Error('Arquivo não foi salvo no disco');
      }

      const fileSize = statSync(filePath).size;
      this.logger.log(`[UPLOAD] ✓ Arquivo salvo com sucesso. Tamanho: ${fileSize} bytes. Path: ${filePath}`);

      const logoUrl = `/api/uploads/logos/${uniqueFilename}`;
      await this.organizationService.updateLogo(organizationId, logoUrl);

      this.logger.log(`[UPLOAD] ✓ Logo URL salva no banco: ${logoUrl}`);

      return {
        success: true,
        logo_url: logoUrl,
        filename: uniqueFilename,
      };
    } catch (error) {
      this.logger.error(`[UPLOAD] ✗ Erro: ${error.message}`, error.stack);

      if (
        error?.code === 'FST_REQ_FILE_TOO_LARGE' ||
        error?.message?.includes('File too large')
      ) {
        throw new PayloadTooLargeException('Arquivo muito grande (máx 5MB)');
      }

      if (error instanceof BadRequestException || error instanceof PayloadTooLargeException) {
        throw error;
      }

      throw new BadRequestException(`Erro ao fazer upload do logo: ${error.message}`);
    }
  }
}

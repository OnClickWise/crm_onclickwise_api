import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';

import { BrandingService } from './branding/branding.service';
import { BrandingController } from './branding/branding.controller';
import { EmailSettingsService } from './email/email-settings.service';
import { EmailSettingsController } from './email/email.controller';
import { EmailService } from './email/email.service';
import { SalesDocumentPdfService } from './pdf/sales-document-pdf.service';

/**
 * Communications module — branding (logo/cores/dados legais),
 * configuração SMTP por organização, geração de PDF, envio de emails
 * transacionais.
 *
 * Exporta os services pra que SalesDocumentsController possa expor
 * endpoints diretos /sales/documents/:id/pdf e /email.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [BrandingController, EmailSettingsController],
  providers: [BrandingService, EmailSettingsService, EmailService, SalesDocumentPdfService],
  exports: [BrandingService, EmailSettingsService, EmailService, SalesDocumentPdfService],
})
export class CommunicationsModule {}

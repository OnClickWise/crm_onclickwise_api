import { Injectable, Inject } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';
import { Attachment } from '@/modules/leads/entities/attachment.entity';
import { randomUUID } from "crypto";
import * as fs from 'fs';
import * as path from 'path';


@Injectable()
export class UploadAttachmentUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(organizationId:string,leadId: string, file: any) {

    const existingLead = await this.leadRepository.existsInOrganization(organizationId,leadId)

    if (!existingLead) {
      return {
          success: false,
          error: 'Lead not found or does not belong to organization'
      };
    } 
    const uploadsDir = path.join(__dirname, '../../uploads');
    const buffer = await file.toBuffer();
    
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, file.filename);
    fs.writeFileSync(filePath, buffer);

    const attachmentId = randomUUID()
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    console.log(file.mimeType)
    const attachment: Attachment = {
      id: attachmentId,
      filename: file.filename,
      originalName: file.originalName,
      mimeType: file.mimetype,
      size: buffer.length,
      url: `${apiBaseUrl}/api/leads/${leadId}/attachments/${attachmentId}`,
      uploadedAt: new Date().toISOString()
    };
    return await this.leadRepository.addAttachment(existingLead, attachment); 
    
  }
}
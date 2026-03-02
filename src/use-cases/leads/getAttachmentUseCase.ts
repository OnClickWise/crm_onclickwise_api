import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { LeadRepository } from '@/modules/leads/repositories/lead.repository';
import { Attachment } from '@/modules/leads/entities/attachment.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GetAttachmentByIdUseCase {
  constructor(
    @Inject('ILeadRepository')
    private leadRepository: LeadRepository
  ) {}

  async execute(organizationId: string,leadId:string,attachmentId:string) {
    const lead = await this.leadRepository.existsInOrganization(organizationId,leadId);
    
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found in this organization`);
    }
    let attachments: Attachment[] = [];
    if (lead.attachments) {
    try {
          // Check if it's already an object or a JSON string
        if (typeof lead.attachments === 'string') {
            attachments = JSON.parse(lead.attachments);
          } else if (Array.isArray(lead.attachments)) {
            attachments = lead.attachments;
          } else {
            console.error('Invalid attachments format:', typeof lead.attachments);
            attachments = [];
          }
        } catch (error) {
          console.error('Error parsing attachments JSON:', error);
          attachments = [];
        }
    }
    const attachment = attachments.find((att: Attachment) => att.id === attachmentId);

    if (!attachment) {
        return {
          success: false,
          error: 'Attachment not found'
        };
    }

    const uploadsDir = path.join(__dirname, '../../uploads');
    const filePath = path.join(uploadsDir, attachment.filename);
      
    if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found on disk'
        };
    }
    return {
        success: true,
        attachment,
        filePath
    };
  }
}
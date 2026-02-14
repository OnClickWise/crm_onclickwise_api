import { Injectable, Inject } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class UploadAttachmentUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(leadId: string, file: any) {
    // A arquitetura antiga guardava metadados do arquivo associados ao lead 
    return await this.leadRepository.addAttachment(leadId, file);
  }
}
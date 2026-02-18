import { Injectable, Inject } from '@nestjs/common';

import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';
import { BulkUpdateLeadDto } from '@/modules/leads/dtos/bulk.update.lead.dto';


@Injectable()
export class BulkPipelineUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(data: BulkUpdateLeadDto) {
    // Validação de segurança: garantir que IDs foram fornecidos
    if (!data.ids || data.ids.length === 0) {
      throw new Error('No leads selected for bulk update');
    }

    return await this.leadRepository.updateBulkPipeline(data);
  }
}
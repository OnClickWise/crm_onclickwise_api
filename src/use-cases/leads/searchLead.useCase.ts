import { Injectable, Inject } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class SearchLeadUseCase {
    
  constructor(
    @Inject('ILeadRepository')
    private leadRepository: ILeadRepository
  ) {}

  async execute(criteria: Record<string, any>) {
    // A lógica antiga permitia busca parcial por nome ou exata por documentos 
    if (!criteria) {
      return [];
    }
    return await this.leadRepository.search(criteria);
  }
}
import { Injectable, Inject } from '@nestjs/common';
import { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Injectable()
export class SearchLeadUseCase {
  constructor(
    private leadRepository: LeadRepository
  ) {}

  async execute(criteria: any) {
    // A lógica antiga permitia busca parcial por nome ou exata por documentos 
    if (typeof criteria === 'string') {
      return await this.leadRepository.search({
        OR: [
          { name: { contains: criteria } },
          { email: { contains: criteria } },
          { ssn: criteria },
          { ein: criteria }
        ]
      });
    }
    return await this.leadRepository.search(criteria);
  }
}
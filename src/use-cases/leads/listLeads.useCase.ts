import { Injectable,Inject } from '@nestjs/common';

import type { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Injectable()
export class ListLeadsUseCase {
  constructor(
     @Inject('LeadRepository')
      private leadRepository: LeadRepository
    ) {}
  

  async execute(organizationId: string) {
    return this.leadRepository.findAll(organizationId);
  }
}

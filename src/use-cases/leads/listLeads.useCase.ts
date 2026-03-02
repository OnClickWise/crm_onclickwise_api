import { Injectable,Inject } from '@nestjs/common';

import { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Injectable()
export class ListLeadsUseCase {
  constructor(
     @Inject('ILeadRepository')
      private leadRepository: LeadRepository
    ) {}
  

  async execute(organizationId: string) {
    return this.leadRepository.findAll(organizationId);
  }
}

import { Injectable,Inject } from '@nestjs/common';

import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class ListLeadsUseCase {
  constructor(
     @Inject('ILeadRepository')
      private leadRepository: ILeadRepository
    ) {}
  

  async execute(organizationId: string) {
    return this.leadRepository.findAll(organizationId);
  }
}

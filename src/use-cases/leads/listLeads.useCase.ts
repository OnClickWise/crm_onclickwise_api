import { Inject, Injectable } from '@nestjs/common';

import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class ListLeadsUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(organizationId: string) {
    return this.leadRepository.findAll({ organizationId });
  }
}

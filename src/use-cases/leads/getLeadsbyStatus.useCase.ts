import { Injectable, Inject } from '@nestjs/common';
import type { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Injectable()
export class GetLeadsByStatusUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: LeadRepository,
  ) {}

  async execute(status: string) {
    return await this.leadRepository.findByStatus(status);
  }
}
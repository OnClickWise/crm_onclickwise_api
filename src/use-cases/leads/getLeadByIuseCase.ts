import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Injectable()
export class GetLeadByIdUseCase {
  constructor(
    @Inject('LeadRepository')
    private leadRepository: LeadRepository
  ) {}

  async execute(id: string) {
    const lead = await this.leadRepository.findById(id);
    
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }
}
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class GetLeadByIdUseCase {
  constructor(
    @Inject('ILeadRepository')
    private leadRepository: ILeadRepository
  ) {}

  async execute(id: string) {
    const lead = await this.leadRepository.findById(id);
    
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }
}
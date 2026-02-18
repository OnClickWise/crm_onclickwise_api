import { Injectable, Inject } from '@nestjs/common';
import { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Injectable()
export class DeleteLeadUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: LeadRepository,
  ) {}

  async execute(id: string) {
    return await this.leadRepository.delete(id);
  }
}
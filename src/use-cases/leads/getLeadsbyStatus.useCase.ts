import { Injectable, Inject } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class GetLeadsByStatusUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(status: string) {
    return await this.leadRepository.findByStatus(status);
  }
}
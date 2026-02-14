import { Injectable, Inject } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';

@Injectable()
export class DeleteLeadUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(id: string) {
    return await this.leadRepository.delete(id);
  }
}
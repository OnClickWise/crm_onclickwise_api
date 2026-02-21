import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';
import { success } from 'zod';

@Injectable()
export class UpdateLeadUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(id: string, data: any) {
    const lead = await this.leadRepository.findById(id);
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const updated = await this.leadRepository.update(id, {
      ...data,
      updatedAt: new Date(),
    });

    return {
      success: true,
      lead: updated
    }
  }
}
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';
import { UpdateLeadDto } from '@/modules/leads/dtos/update.lead.dto';

@Injectable()
export class UpdateLeadUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(id: string, data: UpdateLeadDto, organizationId: string) {
    const lead = await this.leadRepository.findById(id, organizationId);
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const updated = await this.leadRepository.update(id, {
      ...data,
      updatedAt: new Date(),
    }, organizationId);

    return {
      success: true,
      lead: updated,
    };
  }
}
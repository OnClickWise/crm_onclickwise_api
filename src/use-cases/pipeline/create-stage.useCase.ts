import { CreateStageDto } from '@/modules/pipeline/dtos/create-stage.dto';
import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';

import { ConflictException, Injectable } from '@nestjs/common';

import { randomUUID } from 'crypto';


@Injectable()
export class CreatePipelineUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(orgId: string, dto: CreateStageDto) {
    const exists = await this.repo.findBySlug(dto.slug, orgId);

    if (exists) {
      throw new ConflictException('Já existe uma stage com esse slug');
    }

    let order = dto.order;

    if (!order) {
      const last = await this.repo.getLastOrder(orgId);
      order = last ? last.order + 1 : 1;
    }

    return this.repo.create({
      id: randomUUID(),
      organization_id: orgId,
      ...dto,
      order,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

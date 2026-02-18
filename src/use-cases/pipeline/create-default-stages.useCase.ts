import { PipelineStagesRepository } from "@/modules/pipeline/repositories/pipeline-stage.repository";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

@Injectable()
export class CreateDefaultStagesUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(orgId: string) {
    const defaults = [
      { slug: 'entry', color: '#000000', stage_type: 'entry', order: 1 },
      { slug: 'progress', color: '#3B82F6', stage_type: 'progress', order: 2 },
      { slug: 'won', color: '#10B981', stage_type: 'won', order: 3 },
      { slug: 'lost', color: '#EF4444', stage_type: 'lost', order: 4 },
    ];

    for (const stage of defaults) {
      const exists = await this.repo.findBySlug(orgId, stage.slug);

      if (!exists) {
        await this.repo.create({
          id: randomUUID(),
          organization_id: orgId,
          name: stage.slug,
          ...stage,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
  }
}

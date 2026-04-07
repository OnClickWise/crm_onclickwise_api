import { PipelineStagesRepository } from "@/modules/pipeline/repositories/pipeline-stage.repository";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

@Injectable()
export class CreateDefaultStagesUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(orgId: string) {
    const defaults = [
      { name: 'New Leads', slug: 'new', translation_key: 'Pipeline.stages.new', color: '#000000', stage_type: 'entry', order: 1 },
      { name: 'In Contact', slug: 'contact', translation_key: 'Pipeline.stages.contact', color: '#3B82F6', stage_type: 'progress', order: 2 },
      { name: 'Qualified', slug: 'qualified', translation_key: 'Pipeline.stages.qualified', color: '#10B981', stage_type: 'won', order: 3 },
      { name: 'Lost', slug: 'lost', translation_key: 'Pipeline.stages.lost', color: '#EF4444', stage_type: 'lost', order: 4 },
    ];

    for (const stage of defaults) {
      const exists = await this.repo.findBySlug(stage.slug, orgId);

      if (!exists) {
        await this.repo.create({
          id: randomUUID(),
          organization_id: orgId,
          ...stage,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
  }
}

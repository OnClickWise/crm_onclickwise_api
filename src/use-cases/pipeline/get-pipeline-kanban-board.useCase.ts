import { Injectable } from '@nestjs/common';
import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';

@Injectable()
export class GetPipelineKanbanBoardUseCase {
  constructor(private readonly repo: PipelineStagesRepository) {}

  async execute(
    organizationId: string,
    query: {
      search?: string;
      assigned_user_id?: string;
      show_on_pipeline?: string | boolean;
      limit?: string | number;
    } = {},
  ) {
    const parsedShowOnPipeline =
      query.show_on_pipeline === undefined
        ? undefined
        : String(query.show_on_pipeline).toLowerCase() === 'true';

    const parsedLimit = query.limit === undefined ? undefined : Number(query.limit);

    return this.repo.getKanbanBoard(organizationId, {
      search: query.search,
      assignedUserId: query.assigned_user_id,
      showOnPipeline: parsedShowOnPipeline,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }
}

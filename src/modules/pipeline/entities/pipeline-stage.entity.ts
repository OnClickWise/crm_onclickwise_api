import { getDatabase } from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';

import { PipelineStage } from '../Models/pipeline-stage.model.js';

const db = getDatabase();

/**
 * DTOs pertencem ao service (casos de uso)
 * 
 * 
 */
export interface CreateStageDTO {
  name: string;
  slug: string;
  color: string;
  stage_type?: 'entry' | 'progress' | 'won' | 'lost' | null;
  order?: number;
}

export type PipelineStageType =
  | 'entry'
  | 'progress'
  | 'won'
  | 'lost'
  | null;

export interface UpdateStageDTO {
  name?: string;
  color?: string;
  stage_type?: PipelineStageType;
  order?: number;
  is_active?: boolean;
}

export class PipelineStagesService {
  /**
   * Traduções internas (regra de negócio)
   */
  private readonly translations: Record<
    string,
    { pt: string; en: string }
  > = {
    'pipeline.stage.entry': { pt: 'Entrada', en: 'Entry' },
    'pipeline.stage.progress': { pt: 'Em Progresso', en: 'In Progress' },
    'pipeline.stage.won': { pt: 'Ganho', en: 'Won' },
    'pipeline.stage.lost': { pt: 'Perdido', en: 'Lost' },
  };

  /**
   * Buscar stages da organização
   */
  async getStages(
    organizationId: string,
    userLanguage?: string
  ): Promise<PipelineStage[]> {
    const stages: PipelineStage[] = await db('pipeline_stages')
      .where({ organization_id: organizationId, is_active: true })
      .orderBy('order', 'asc');

    if (!userLanguage) return stages;

    const lang = userLanguage === 'en' ? 'en' : 'pt';

    return stages.map(stage => {
      if (stage.translation_key && this.translations[stage.translation_key]) {
        return {
          ...stage,
          name: this.translations[stage.translation_key][lang],
        };
      }
      return stage;
    });
  }

  /**
   * Buscar stage por ID
   */
  async getStageById(
    stageId: string,
    organizationId: string,
    userLanguage?: string
  ): Promise<PipelineStage | null> {
    const stage: PipelineStage | undefined = await db('pipeline_stages')
      .where({ id: stageId, organization_id: organizationId })
      .first();

    if (!stage) return null;

    if (
      userLanguage &&
      stage.translation_key &&
      this.translations[stage.translation_key]
    ) {
      const lang = userLanguage === 'en' ? 'en' : 'pt';
      return {
        ...stage,
        name: this.translations[stage.translation_key][lang],
      };
    }

    return stage;
  }

  /**
   * Criar nova stage
   */
  async createStage(
    organizationId: string,
    data: CreateStageDTO
  ): Promise<PipelineStage> {
    const exists = await db('pipeline_stages')
      .where({ organization_id: organizationId, slug: data.slug })
      .first();

    if (exists) {
      throw new Error('Já existe uma stage com esse slug');
    }

    let order = data.order;
    if (order === undefined) {
      const last = await db('pipeline_stages')
        .where({ organization_id: organizationId })
        .orderBy('order', 'desc')
        .first();

      order = last ? last.order + 1 : 1;
    }

    const now = new Date();

    const stage: PipelineStage = {
      id: uuidv4(),
      organization_id: organizationId,
      name: data.name,
      slug: data.slug,
      color: data.color,
      stage_type: data.stage_type ?? null,
      order,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    await db('pipeline_stages').insert(stage);

    return stage;
  }

  /**
   * Atualizar stage
   */
  async updateStage(
    stageId: string,
    organizationId: string,
    data: UpdateStageDTO,
    userLanguage?: string
  ): Promise<PipelineStage> {
    const stage = await this.getStageById(stageId, organizationId);

    if (!stage) {
      throw new Error('Stage não encontrada');
    }

    await db('pipeline_stages')
      .where({ id: stageId, organization_id: organizationId })
      .update({
        ...data,
        updated_at: new Date(),
      });

    return (await this.getStageById(
      stageId,
      organizationId,
      userLanguage
    )) as PipelineStage;
  }

  /**
   * Deletar stage (hard delete)
   */
  async deleteStage(stageId: string, organizationId: string): Promise<void> {
    const stage = await this.getStageById(stageId, organizationId);
    if (!stage) throw new Error('Stage não encontrada');

    await db('pipeline_stages')
      .where({ id: stageId, organization_id: organizationId })
      .delete();
  }

  /**
   * Reordenar stages
   */
  async reorderStages(
    organizationId: string,
    stageIds: string[]
  ): Promise<void> {
    const trx = await db.transaction();

    try {
      for (let i = 0; i < stageIds.length; i++) {
        await trx('pipeline_stages')
          .where({ id: stageIds[i], organization_id: organizationId })
          .update({
            order: i + 1,
            updated_at: new Date(),
          });
      }

      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }

  /**
   * Criar stages padrão da organização
   */
  async createDefaultStages(organizationId: string): Promise<void> {
    const defaults = [
      { slug: 'entry', key: 'pipeline.stage.entry', color: '#000000', type: 'entry', order: 1 },
      { slug: 'progress', key: 'pipeline.stage.progress', color: '#3B82F6', type: 'progress', order: 2 },
      { slug: 'won', key: 'pipeline.stage.won', color: '#10B981', type: 'won', order: 3 },
      { slug: 'lost', key: 'pipeline.stage.lost', color: '#EF4444', type: 'lost', order: 4 },
    ];

    const now = new Date();

    for (const stage of defaults) {
      const existing = await db('pipeline_stages')
        .where({ organization_id: organizationId, slug: stage.slug })
        .first();

      if (existing) {
        await db('pipeline_stages')
          .where({ id: existing.id })
          .update({
            translation_key: stage.key,
            color: stage.color,
            stage_type: stage.type,
            order: stage.order,
            updated_at: now,
          });
      } else {
        await db('pipeline_stages').insert({
          id: uuidv4(),
          organization_id: organizationId,
          name: stage.slug,
          slug: stage.slug,
          translation_key: stage.key,
          color: stage.color,
          stage_type: stage.type,
          order: stage.order,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      }
    }
  }
}

export const pipelineStagesService = new PipelineStagesService();

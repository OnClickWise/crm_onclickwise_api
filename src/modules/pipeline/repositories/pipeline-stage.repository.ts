import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';

type PipelineKanbanFilters = {
  search?: string;
  assignedUserId?: string;
  showOnPipeline?: boolean;
  limit?: number;
};

@Injectable()
export class PipelineStagesRepository {
  constructor(@Inject('knex') private knex: Knex) {}

  private normalizeStageKey(value?: string | null): string {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  findByOrg(organizationId: string) {
    return this.knex('pipeline_stages')
      .where({ organization_id: organizationId, is_active: true })
      .orderBy('order', 'asc');
  }
  

  findById(id: string, organizationId: string) {
    return this.knex('pipeline_stages')
      .where({ id, organization_id: organizationId })
      .first();
  }

  findBySlug(slug: string, organizationId: string) {
    return this.knex('pipeline_stages')
      .where({ slug, organization_id: organizationId })
      .first();
  }

  async getLastOrder(organizationId: string) {
    return this.knex('pipeline_stages')
      .where({ organization_id: organizationId })
      .orderBy('order', 'desc')
      .first();
  }

  create(data: any) {
    return this.knex('pipeline_stages').insert(data);
  }

  update(id: string, orgId: string, data: any) {
    return this.knex('pipeline_stages')
      .where({ id, organization_id: orgId })
      .update(data);
  }

  delete(id: string, orgId: string) {
    return this.knex('pipeline_stages')
      .where({ id, organization_id: orgId })
      .delete();
  }

  async deleteSafely(id: string, orgId: string) {
    return this.knex.transaction(async (trx) => {
      const leadColumns = await trx('information_schema.columns')
        .select('column_name')
        .where({ table_name: 'leads' });

      const hasStageId = leadColumns.some((row: any) => String(row.column_name) === 'stage_id');

      if (hasStageId) {
        await trx('leads')
          .where({ organization_id: orgId, stage_id: id })
          .update({
            stage_id: null,
            updated_at: trx.fn.now(),
          });
      }

      const deletedCount = await trx('pipeline_stages')
        .where({ id, organization_id: orgId })
        .delete();

      return deletedCount;
    });
  }

  async getKanbanBoard(organizationId: string, filters: PipelineKanbanFilters = {}) {
    const [stages, leadColumnRows] = await Promise.all([
      this.findByOrg(organizationId),
      this.knex('information_schema.columns')
        .select('column_name')
        .where({ table_name: 'leads' }),
    ]);

    const leadColumns = new Set(leadColumnRows.map((r: any) => String(r.column_name)));
    const hasStageId = leadColumns.has('stage_id');
    const hasShowOnPipeline = leadColumns.has('show_on_pipeline');
    const hasEstimatedCloseDate = leadColumns.has('estimated_close_date');
    const hasLegacyEstCloseDate = leadColumns.has('est_close_date');

    const selectedColumns: Array<string | Knex.Raw> = [
      'id',
      'organization_id',
      'assigned_user_id',
      'name',
      'email',
      'phone',
      'source',
      'status',
      'value',
      'description',
      'created_at',
      'updated_at',
    ];

    if (leadColumns.has('location')) selectedColumns.push('location');
    if (leadColumns.has('interest')) selectedColumns.push('interest');
    if (hasShowOnPipeline) selectedColumns.push('show_on_pipeline');
    if (hasStageId) selectedColumns.push('stage_id');
    if (hasEstimatedCloseDate) {
      selectedColumns.push('estimated_close_date');
    } else if (hasLegacyEstCloseDate) {
      selectedColumns.push(this.knex.raw('est_close_date as estimated_close_date'));
    }

    const limit = Math.max(1, Math.min(Number(filters.limit || 300), 1000));
    const leadsQuery = this.knex('leads')
      .select(selectedColumns)
      .where('organization_id', organizationId)
      .orderBy('updated_at', 'desc')
      .limit(limit);

    if (hasShowOnPipeline) {
      const showOnPipeline = filters.showOnPipeline ?? true;
      leadsQuery.andWhere('show_on_pipeline', showOnPipeline);
    }

    if (filters.assignedUserId) {
      leadsQuery.andWhere('assigned_user_id', filters.assignedUserId);
    }

    if (filters.search) {
      const q = `%${filters.search}%`;
      leadsQuery.andWhere((builder) => {
        builder
          .where('name', 'ilike', q)
          .orWhere('email', 'ilike', q)
          .orWhere('phone', 'ilike', q);
      });
    }

    const leads = await leadsQuery;

    const stageLeadsMap = new Map<string, any[]>();
    const stageSlugMap = new Map<string, string>();
    for (const stage of stages) {
      stageLeadsMap.set(stage.id, []);
      stageSlugMap.set(this.normalizeStageKey(stage.slug), stage.id);
    }

    const uncategorizedLeads: any[] = [];
    for (const lead of leads as any[]) {
      const leadStageId = hasStageId ? lead.stage_id : null;
      if (leadStageId && stageLeadsMap.has(leadStageId)) {
        stageLeadsMap.get(leadStageId)!.push(lead);
        continue;
      }

      const statusKey = this.normalizeStageKey(lead.status);
      const matchedStageId = stageSlugMap.get(statusKey);
      if (matchedStageId && stageLeadsMap.has(matchedStageId)) {
        stageLeadsMap.get(matchedStageId)!.push(lead);
      } else {
        uncategorizedLeads.push(lead);
      }
    }

    const stagesWithLeads = stages.map((stage: any) => ({
      ...stage,
      leads: stageLeadsMap.get(stage.id) || [],
    }));

    const totalLeads = leads.length;
    const totalValue = leads.reduce((acc: number, lead: any) => acc + Number(lead.value || 0), 0);
    const wonLeads = stagesWithLeads
      .filter((stage: any) => stage.stage_type === 'won')
      .reduce((acc: number, stage: any) => acc + stage.leads.length, 0);

    return {
      stages: stagesWithLeads,
      uncategorizedLeads,
      metrics: {
        totalLeads,
        totalValue,
        conversionRate: totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0,
      },
    };
  }

  async reorder(organizationId: string, stageIds: string[]) {
    if (!stageIds || stageIds.length === 0) {
      return;
    }

    const caseSql = stageIds.map(() => 'WHEN id = ? THEN ?').join(' ');
    const inSql = stageIds.map(() => '?').join(', ');
    const bindings: Array<string | number> = [];

    stageIds.forEach((id, index) => {
      bindings.push(id, index + 1);
    });

    bindings.push(organizationId, ...stageIds);

    await this.knex.raw(
      `
      UPDATE pipeline_stages
      SET
        "order" = CASE ${caseSql} ELSE "order" END,
        "updated_at" = NOW()
      WHERE "organization_id" = ?
        AND "id" IN (${inSql})
      `,
      bindings,
    );
  }
}

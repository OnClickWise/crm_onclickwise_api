import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';

@Injectable()
export class PipelineStagesRepository {
  constructor(@Inject('Knex') private knex: Knex) {}

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

  async reorder(organizationId: string, stageIds: string[]) {
    const trx = await this.knex.transaction();

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
}

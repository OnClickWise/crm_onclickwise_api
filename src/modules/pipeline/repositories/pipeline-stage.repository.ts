import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';


@Injectable()
export class PipelineStagesRepository {
  constructor(@Inject('knex') private knex: Knex) {}

  findByOrg(organizationId: string) {
    return this.knex('pipeline_stages')
      .where({ organization_id: organizationId, is_active: true })
      .orderBy('order', 'asc');
  }
  
  async findBySlug(slug: string) {
    return this.knex('organizations')
      .where({ slug })
      .first();
  }

  findById(id: string, organizationId: string) {
    return this.knex('pipeline_stages')
      .where({ id, organization_id: organizationId })
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
}

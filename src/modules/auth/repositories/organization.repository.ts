import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { IOrganizationRepository } from './interface/organization.repository.interface';


@Injectable()
export class OrganizationRepository implements IOrganizationRepository {
  constructor(
    @Inject('Knex')
    private readonly knex: Knex,
  ) {}

  async findBySlug(slug: string) {
    return this.knex('organizations')
      .where({ slug })
      .first();
  }

  async create(data: any) {
    const [organization] = await this.knex('organizations')
      .insert({
        ...data,
      })
      .returning('*');

    return organization;
  }
}

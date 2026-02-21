import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { IOrganizationRepository } from './interface/organization.repository.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class OrganizationRepository implements IOrganizationRepository {
  constructor(
    @Inject('knex')
    private readonly knex: Knex,
  ) {}

  async findBySlug(slug: string) {
    return this.knex('organizations').where({ slug }).first();
  }

    async create(data: any) {
    console.log(data)
    const [organization] = await this.knex('organizations')
      .insert({
        id: randomUUID(),
        ...data,
      })
      .returning('*');
    return organization;
  }

}

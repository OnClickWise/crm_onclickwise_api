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
    const payload = {
      name: data.name,
      slug: data.slug,
      email: data.email,
      company_id: data.company_id,
      phone: data.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      country: data.country,
      logo_url: data.logo_url,
      password: data.password,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [organization] = await this.knex('organizations')
      .insert({
        id: randomUUID(),
        ...payload,
      })
      .returning('*');

    return organization;
  }
}

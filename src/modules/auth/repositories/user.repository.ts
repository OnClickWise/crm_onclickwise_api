import { Injectable } from '@nestjs/common';

import { Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { IUserRepository } from './interface/user.repository.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @Inject('knex')
    private readonly knex: Knex,
  ) {}

  async findByEmail(email: string) {
    const user = await this.knex('users')
      .where({ email })
      .first();

    if (!user) return null;

    const organization = await this.knex('organizations')
      .where({ id: user.organization_id })
      .first();

    return {
      id: user.id,
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role,
      isTemporaryPassword: user.is_temporary_password,
      organizationId: user.organization_id,
      organization,
    };
  }

  async create(data: {
    name: string;
    email: string;
    password: string
    organizationId: string;
    role: string;
  }) {
    const [user] = await this.knex('users')
      .insert({
        id: randomUUID(),
        name: data.name,
        email: data.email,
        password: data.password,
        organization_id: data.organizationId,
        role: data.role,
      })
      .returning('*');

    return user;
  }

  async findById(id: string) {
  const user = await this.knex('users')
    .where({ id })
    .first()

  if (!user) return null

  const organization = await this.knex('organizations')
    .where({ id: user.organization_id })
    .first()

  return {
    ...user,
    organization,
  }
}
}

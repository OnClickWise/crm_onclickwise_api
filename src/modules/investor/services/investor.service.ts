import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class InvestorService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getOrganizationId(user: any): string {
    if (!user?.organizationId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }

    return user.organizationId;
  }

  async createInvestor(data: any, user: any) {
    const organizationId = this.getOrganizationId(user);

    const [investor] = await this.knex('investors')
      .insert({
        id: randomUUID(),
        organization_id: organizationId,
        name: data.name,
        email: data.email,
        document: data.document || null,
        is_active: data.isActive ?? true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return investor;
  }

  async listInvestors(user: any) {
    const organizationId = this.getOrganizationId(user);

    return this.knex('investors')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc');
  }

  async getInvestorById(id: string, user: any) {
    const organizationId = this.getOrganizationId(user);

    const investor = await this.knex('investors')
      .where({ id, organization_id: organizationId })
      .first();

    if (!investor) {
      throw new NotFoundException('Investidor não encontrado');
    }

    return investor;
  }

  async updateInvestor(id: string, data: any, user: any) {
    const organizationId = this.getOrganizationId(user);

    const payload: any = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) payload.name = data.name;
    if (data.email !== undefined) payload.email = data.email;
    if (data.document !== undefined) payload.document = data.document;
    if (data.isActive !== undefined) payload.is_active = data.isActive;

    const [investor] = await this.knex('investors')
      .where({ id, organization_id: organizationId })
      .update(payload)
      .returning('*');

    if (!investor) {
      throw new NotFoundException('Investidor não encontrado');
    }

    return investor;
  }

  async deleteInvestor(id: string, user: any) {
    const organizationId = this.getOrganizationId(user);

    const deleted = await this.knex('investors')
      .where({ id, organization_id: organizationId })
      .delete();

    if (!deleted) {
      throw new NotFoundException('Investidor não encontrado');
    }

    return { success: true };
  }
}

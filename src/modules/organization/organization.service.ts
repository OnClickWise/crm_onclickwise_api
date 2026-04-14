import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { UpdateOrganizationDto } from './dtos/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject('knex')
    private readonly knex: Knex,
  ) {}

  async findByUserId(userId: string): Promise<any> {
    const user = await this.knex('users')
      .where({ id: userId })
      .first();

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const organization = await this.knex('organizations')
      .where({ id: user.organization_id })
      .first();

    if (!organization) {
      throw new NotFoundException('Organização não encontrada');
    }

    return organization;
  }

  async findBySlug(slug: string): Promise<any> {
    const organization = await this.knex('organizations')
      .where({ slug })
      .first();

    if (!organization) {
      throw new NotFoundException('Organização não encontrada');
    }

    return organization;
  }

  async update(organizationId: string, data: UpdateOrganizationDto): Promise<any> {
    const allowedFields = [
      'name',
      'email',
      'phone',
      'address',
      'city',
      'state',
      'country',
      'company_id',
      'primary_color',
      'secondary_color',
      'legal_representative_name',
      'legal_representative_email',
      'legal_representative_phone',
      'legal_representative_ssn',
    ];

    // Filtrar apenas campos permitidos
    const updateData = {};
    Object.keys(data).forEach((key) => {
      if (allowedFields.includes(key) && data[key] !== undefined) {
        updateData[key] = data[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new NotFoundException('Nenhum campo válido para atualizar');
    }

    const result = await this.knex('organizations')
      .where({ id: organizationId })
      .update(updateData)
      .returning('*');

    if (!result || result.length === 0) {
      throw new NotFoundException('Organização não encontrada');
    }

    return result[0];
  }

  async updateLogo(organizationId: string, logoUrl: string): Promise<void> {
    const result = await this.knex('organizations')
      .where({ id: organizationId })
      .update({ logo_url: logoUrl })
      .returning('*');

    if (!result || result.length === 0) {
      throw new NotFoundException('Organização não encontrada');
    }
  }
}

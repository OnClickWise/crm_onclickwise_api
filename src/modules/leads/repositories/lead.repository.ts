import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import type { ILeadRepository } from './interface/lead.repository.interface';
import { LeadEntity } from '../entities/lead.entity';
import { CreateLeadDto } from '@/modules/leads/dtos/create.lead.dto';
import { UpdateLeadDto } from '@/modules/leads/dtos/update.lead.dto';
import { FilterLeadDto } from '@/modules/leads/dtos/lead.filter.dto';
import { BulkUpdateLeadDto } from '@/modules/leads/dtos/bulk.update.lead.dto';

@Injectable()
export class LeadRepository implements ILeadRepository {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private readonly tableName = 'leads';

  async create(data: any): Promise<LeadEntity> {
    const [result] = await this.knex(this.tableName)
      .insert({
        id: data.id || this.knex.raw('uuid_generate_v4()'), // Garante ID se não enviado
        organization_id: data.organizationId,
        assigned_user_id: data.assignedUserId || null,
        name: data.name,
        email: data.email,
        phone: data.phone,
        ssn: data.ssn,
        ein: data.ein,
        source: data.source,
        status: data.status || 'New',
        value: data.value,
        description: data.description,
        estimated_close_date: data.estimatedCloseDate,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return result;
  }

  async findAll(filters: any): Promise<{ data: LeadEntity[]; total: number }> {
    const query = this.knex(this.tableName);

    if (filters.organizationId) {
      query.where('organization_id', filters.organizationId);
    }

    if (filters.assignedUserId) {
      query.where('assigned_user_id', filters.assignedUserId);
    }

    const [totalRes] = await query.clone().count('id as count');
    const data = await query
      .clone()
      .limit(filters.limit || 10)
      .offset(((filters.page || 1) - 1) * (filters.limit || 10))
      .orderBy('created_at', 'desc');

    return {
      data,
      total: Number(totalRes?.count || 0),
    };
  }

  async update(id: string, data: any): Promise<LeadEntity> {
    // Mapeia camelCase do DTO para snake_case do Banco
    const updateData: any = {
      updated_at: new Date(),
    };

    if (data.name) updateData.name = data.name;
    if (data.status) updateData.status = data.status;
    if (data.assignedUserId !== undefined) updateData.assigned_user_id = data.assignedUserId;
    if (data.value !== undefined) updateData.value = data.value;
    if (data.estimatedCloseDate) updateData.estimated_close_date = data.estimatedCloseDate;

    const [updated] = await this.knex(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');
    return updated;
  }

  async search(criteria: string | any): Promise<LeadEntity[]> {
    return this.knex(this.tableName)
      .where((builder) => {
        builder.where('name', 'ilike', `%${criteria}%`)
          .orWhere('email', 'ilike', `%${criteria}%`)
          .orWhere('ssn', criteria) // Busca exata por documento
          .orWhere('ein', criteria);
      })
      .orderBy('name', 'asc');
  }

  async findById(id: string): Promise<LeadEntity | null> {
    return this.knex(this.tableName)
      .where({ id })
      .first();
  }

  async findByStatus(status: string, organizationId?: string): Promise<LeadEntity[]> {
    const query = this.knex(this.tableName).where({ status });
    if (organizationId) query.andWhere({ organization_id: organizationId });
    return query;
  }

  async updateBulkPipeline(data: BulkUpdateLeadDto): Promise<void> {
    await this.knex(this.tableName)
      .whereIn('id', data.ids)
      .update({
        status: data.status,
        pipeline_id: data.pipelineId,
        stage_id: data.stageId,
        updated_at: new Date(),
      });
  }

  async delete(id: string): Promise<void> {
    // Soft delete ou Hard delete conforme sua regra de negócio
    await this.knex(this.tableName).where({ id }).delete();
  }

  async addAttachment(leadId: string, attachmentData: any): Promise<void> {
    await this.knex('lead_attachments').insert({
      lead_id: leadId,
      ...attachmentData,
      created_at: new Date(),
    });
  }

  async removeAttachment(leadId: string, attachmentId: string): Promise<void> {
    await this.knex('lead_attachments')
      .where({ id: attachmentId, lead_id: leadId })
      .delete();
  }
}
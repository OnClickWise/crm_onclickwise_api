import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import type { ILeadRepository } from './interface/lead.repository.interface';
import { LeadEntity } from '../entities/lead.entity';
import { CreateLeadDto } from '@/modules/leads/dtos/create.lead.dto';
import { UpdateLeadDto } from '@/modules/leads/dtos/update.lead.dto';
import { FilterLeadDto } from '@/modules/leads/dtos/lead.filter.dto';
import { BulkUpdateLeadDto } from '@/modules/leads/dtos/bulk.update.lead.dto';
import { Attachment } from '../entities/attachment.entity';


function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

@Injectable()
export class LeadRepository implements ILeadRepository {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private readonly tableName = 'leads';
  private leadColumnsCache: Set<string> | null = null;

  private async getLeadColumns(): Promise<Set<string>> {
    if (this.leadColumnsCache) {
      return this.leadColumnsCache;
    }

    const rows = await this.knex('information_schema.columns')
      .select('column_name')
      .where({ table_name: this.tableName });

    this.leadColumnsCache = new Set(rows.map((r: any) => String(r.column_name)));
    return this.leadColumnsCache;
  }

  async create(data: any): Promise<LeadEntity> {
    const leadColumns = await this.getLeadColumns();

    const insertData: any = {
      id: uuidv4(),
      organization_id: data.organization_id,
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
      estimated_close_date: data.estimated_close_date,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (leadColumns.has('location')) {
      insertData.location = data.location || null;
    }

    if (leadColumns.has('interest')) {
      insertData.interest = data.interest || null;
    }

    const [result] = await this.knex(this.tableName)
      .insert(insertData)
      .returning('*');
    return result;
  }

  async findAll(filters: any): Promise<{ leads:LeadEntity[]; total: number }> {
    const normalizedFilters =
      typeof filters === 'string' ? { organizationId: filters } : (filters || {});

    const query = this.knex(this.tableName);
    if (normalizedFilters.organizationId) {
      query.where('organization_id', normalizedFilters.organizationId);
    }

    if (normalizedFilters.assignedUserId) {
      query.where('assigned_user_id', normalizedFilters.assignedUserId);
    }

    const [totalRes] = await query.clone().count('id as count');
    const data = await query
      .clone()
      .limit(normalizedFilters.limit || 10)
      .offset(((normalizedFilters.page || 1) - 1) * (normalizedFilters.limit || 10))
      .orderBy('created_at', 'desc');
    
    return {
      leads:  data,
      total: Number(totalRes?.count || 0),
    };
  }

  async update(id: string, data: any): Promise<LeadEntity> {
    const leadColumns = await this.getLeadColumns();

    // Mapeia camelCase do DTO para snake_case do Banco
    const updateData: any = {
      updated_at: new Date(),
    };

    if (data.name) updateData.name = data.name;
    if (data.status) updateData.status = data.status;
    if (data.assignedUserId !== undefined) updateData.assigned_user_id = data.assignedUserId;
    if (data.assigned_user_id !== undefined) updateData.assigned_user_id = data.assigned_user_id;
    if (data.show_on_pipeline !== undefined) updateData.show_on_pipeline = data.show_on_pipeline;
    if (data.pipelineId !== undefined) updateData.pipeline_id = data.pipelineId;
    if (data.stageId !== undefined) updateData.stage_id = data.stageId;
    if (data.value !== undefined) updateData.value = data.value;
    if (data.estimated_close_date) updateData.estimated_close_date = data.estimated_close_date;
    if (leadColumns.has('location') && data.location !== undefined) updateData.location = data.location;
    if (leadColumns.has('interest') && data.interest !== undefined) updateData.interest = data.interest;

    const [updated] = await this.knex(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');
    return updated;
  }

  async search(filters: any): Promise<{ leads: LeadEntity[]; total: number }> {
    const leadColumns = await this.getLeadColumns();
    const query = this.knex(this.tableName);

    // 1. Pegamos o termo de busca (pode vir como 'q' ou 'search' do frontend)
    const searchTerm = filters.q || filters.search;

    if (searchTerm) {
      query.where((builder) => {
        builder.where('name', 'ilike', `%${searchTerm}%`)
              .orWhere('email', 'ilike', `%${searchTerm}%`);
        
        if (!/[a-zA-Z]/.test(searchTerm)) {
          builder.orWhere('ssn', searchTerm).orWhere('ein', searchTerm);
        }
      });
    }

    const { q, search, page, limit, ...specificFilters } = filters;
    
    Object.entries(specificFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (leadColumns.has(key)) {
          query.where(`${this.tableName}.${key}`, value);
        }
      }
    });


    const totalQuery = query.clone().count('id as count').first();
    
    const leads = await query
      .orderBy('name', 'asc')
      .limit(limit || 10)
      .offset(((page || 1) - 1) * (limit || 10));

    const totalResult = await totalQuery;

    return {
      leads,
      total: Number(totalResult?.count || 0),
    };
  }

  async findById(id: string): Promise<LeadEntity | null> {
    return await this.knex(this.tableName)
      .where({ id })
      .first();
  }

  async existsInOrganization(organizationId:string,leadId:string){
    return await this.knex(this.tableName)
        .where('id', leadId)
        .where('organization_id', organizationId)
        .first();
  }

  async findByEmail(email: string,organizationId:string): Promise<LeadEntity | null> {
    const query = this.knex(this.tableName).where({ email });
    if (organizationId) query.andWhere({ organization_id: organizationId });
    return query.first();
  }

  async findByStatus(status: string, organizationId?: string): Promise<LeadEntity[]> {
    const query = this.knex(this.tableName).where({ status });
    if (organizationId) query.andWhere({ organization_id: organizationId });
    return query;
  }

  async updateBulkPipeline(data: BulkUpdateLeadDto, organizationId?: string): Promise<void> {
    const payload: any = {
      updated_at: new Date(),
    };

    if (data.status !== undefined) payload.status = data.status;
    if (data.pipelineId !== undefined) payload.pipeline_id = data.pipelineId;
    if (data.stageId !== undefined) payload.stage_id = data.stageId;
    if (data.show_on_pipeline !== undefined) payload.show_on_pipeline = data.show_on_pipeline;

    const query = this.knex(this.tableName)
      .whereIn('id', data.lead_ids);

    if (organizationId) {
      query.andWhere('organization_id', organizationId);
    }

    await query.update(payload);
  }

  async delete(id: string): Promise<void> {
    await this.knex(this.tableName).where({ id }).delete();
  }

  async addAttachment(lead:LeadEntity, attachment: Attachment): Promise<LeadEntity> {

    let currentAttachments:Attachment[] = [];

      if (lead.attachments) {
        try {
          // Check if it's already an object or a JSON string
          if (typeof lead.attachments === 'string') {
            currentAttachments = JSON.parse(lead.attachments);
          } else if (Array.isArray(lead.attachments)) {
            currentAttachments = lead.attachments;
          } else {
            console.error('Invalid attachments format:', typeof lead.attachments);
            currentAttachments = [];
          }
        } catch (error) {
          console.error('Error parsing attachments JSON:', error);
          currentAttachments = [];
        }
      }
      
      currentAttachments.push(attachment);

      const [updatedLead] = await this.knex(this.tableName)
        .where('id', lead.id)
        .andWhere('organization_id', lead.organization_id)
        .update({
          attachments: JSON.stringify(currentAttachments),
          updated_at: new Date().toISOString()
        })
        .returning('*');
      return updatedLead
  }


  async getAttachmentById(leadId: string, attachmentId: string, organizationId: string)
  {

  }


  async removeAttachment(leadId: string, attachmentId: string): Promise<void> {
    await this.knex('lead_attachments')
      .where({ id: attachmentId, lead_id: leadId })
      .delete();
  }
}
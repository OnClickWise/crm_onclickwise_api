
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class ProjectService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  private async ensureProjectAccess(id: string | number, user: any) {
    const project = await this.knex('projects as p')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('p.id', String(id))
      .andWhere('owner.organization_id', user.organizationId)
      .select('p.*')
      .first();

    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    return project;
  }

  /**
   * Busca um projeto por ID. 
   * Aceita string ou number para evitar erros de compilação nos Use Cases.
   */
  async getProjectById(id: string | number, user: any) {
    try {
      const project = await this.knex('projects')
        .join('users as owner', 'owner.id', 'projects.owner_id')
        .where('projects.id', String(id))
        .andWhere('owner.organization_id', user.organizationId)
        .select('projects.*')
        .first();
      return project || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Lista projetos vinculados ao workspace
   */
  async listProjects(user: any) {
    return await this.knex('projects')
      .join('users as owner', 'owner.id', 'projects.owner_id')
      .where('owner.organization_id', user.organizationId)
      .select('projects.*')
      .orderBy('created_at', 'desc');
  }

  async listOrganizationUsers(user: any, includeMaster = false) {
    const query = this.knex('users')
      .where({ organization_id: user.organizationId })
      .select('id', 'name', 'email', 'role', 'created_at')
      .orderBy('name', 'asc');

    if (!includeMaster) {
      query.whereNot({ role: 'master' });
    }

    return query;
  }

  /**
   * Cria um novo projeto recebendo dados e o usuário (conforme exigido pelo Use Case)
   */
  async createProject(data: any, user: any) {
    const [project] = await this.knex('projects')
      .insert({
        id: randomUUID(),
        name: data.name,
        description: data.description,
        owner_id: user.userId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return project;
  }

  /**
   * Atualiza um projeto existente
   */
  async updateProject(id: string | number, data: any, user: any) {
    await this.ensureProjectAccess(id, user);

    const payload: Record<string, any> = {
      updated_at: new Date(),
    };

    if (typeof data.name === 'string') {
      payload.name = data.name;
    }

    if (data.description !== undefined) {
      payload.description = data.description;
    }

    const [project] = await this.knex('projects')
      .where({ id: String(id) })
      .update(payload)
      .returning('*');
    return project;
  }

  /**
   * Remove um projeto do sistema
   */
  async deleteProject(id: string | number, user: any) {
    await this.ensureProjectAccess(id, user);

    return await this.knex('projects')
      .where({ id: String(id) })
      .delete();
  }
}
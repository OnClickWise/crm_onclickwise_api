
import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class ProjectService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  /**
   * Busca um projeto por ID. 
   * Aceita string ou number para evitar erros de compilação nos Use Cases.
   */
  async getProjectById(id: string | number, user: any) {
    try {
      const project = await this.knex('projects')
        .where({ id: String(id), owner_id: user.userId })
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
      .where({ owner_id: user.userId })
      .orderBy('created_at', 'desc');
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
    const [project] = await this.knex('projects')
      .where({ id: String(id), owner_id: user.userId })
      .update({
        name: data.name,
        description: data.description,
        updated_at: new Date(),
      })
      .returning('*');
    return project;
  }

  /**
   * Remove um projeto do sistema
   */
  async deleteProject(id: string | number, user: any) {
    return await this.knex('projects')
      .where({ id: String(id), owner_id: user.userId })
      .delete();
  }
}
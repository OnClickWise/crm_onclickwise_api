import {
  AuthPayload,
  LoginRequest,
  LoginResponse,
} from '@/modules/auth/entities/auth/auth.entity';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';
import { CreateStageDto } from '@/modules/pipeline/dtos/create-stage.dto';
import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';
import { JWT_SECRET } from '@/shared/config/config';

import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

import * as jwt from 'jsonwebtoken';

@Injectable()
export class CreatePipelineUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(orgId: string, dto: CreateStageDto) {
    const exists = await this.repo.findBySlug(dto.slug);
    if (exists) throw new Error('Stage already exists');

    return this.repo.create({
      id: randomUUID(),
      organization_id: orgId,
      ...dto,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

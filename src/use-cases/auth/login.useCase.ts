import { AuthPayload, LoginRequest, LoginResponse } from '@/modules/auth/entities/auth/auth.entity';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';
import { JWT_SECRET } from '@/shared/config/config';


import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import * as jwt from 'jsonwebtoken';


@Injectable()
export class LoginUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(data: LoginRequest): Promise<LoginResponse> {
    try {
      const user = await this.userRepository.findByEmail(data.email);

      if (!user) {
        return { success: false, error: 'Credenciais inválidas' };
      }

      const match = await bcrypt.compare(data.password, user.password);

      if (!match) {
        return { success: false, error: 'Credenciais inválidas' };
      }

      const payload: AuthPayload = {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          is_temporary_password: user.isTemporaryPassword,
        },
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          email: user.organization.email,
        },
      };
    } catch {
      return { success: false, error: 'Erro interno no login' };
    }
  }
}

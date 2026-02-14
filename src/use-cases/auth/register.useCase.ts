import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';



import { IOrganizationRepository } from '@/modules/auth/repositories/interface/organization.repository.interface';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';
import { AuthPayload, RegisterRequest, RegisterResponse } from '@/modules/auth/entities/auth/auth.entity';
import { JWT_SECRET } from '@/shared/config/config';

@Injectable()
export class RegisterUseCase {
  constructor(
    private organizationRepository: IOrganizationRepository,
    private userRepository: IUserRepository,
  ) {}

  async execute(data: RegisterRequest): Promise<RegisterResponse> {
    try {
      const existingOrg = await this.organizationRepository.findBySlug(
        data.organization.slug,
      );

      if (existingOrg) {
        return { success: false, error: 'Organização já existe' };
      }

      const hashedPassword = await bcrypt.hash(
        data.organization.password,
        10,
      );

      const organization = await this.organizationRepository.create({
        ...data.organization,
        password: hashedPassword,
      });

      const user = await this.userRepository.create({
        name: data.representative.name,
        email: data.representative.email,
        organizationId: organization.id,
        role: 'admin',
      });

      const payload: AuthPayload = {
        userId: user.id,
        email: user.email,
        organizationId: organization.id,
        role: 'admin',
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          email: organization.email,
        },
      };
    } catch {
      return { success: false, error: 'Erro interno no registro' };
    }
  }
}

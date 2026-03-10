import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { IOrganizationRepository } from '@/modules/auth/repositories/interface/organization.repository.interface';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';
import {
  AuthPayload,
  RegisterRequest,
  RegisterResponse,
} from '@/modules/auth/entities/auth/auth.entity';

import { TokenService } from '@/modules/auth/services/token.service';
import { RefreshTokenRepository } from '@/modules/auth/repositories/refresh-token.repository';

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(data: RegisterRequest): Promise<RegisterResponse> {
    // 1️⃣ validar se organização já existe
    const existingOrg = await this.organizationRepository.findBySlug(
      data.organization.slug,
    );
    console.log('oi')
    if (existingOrg) {
      throw new BadRequestException('Organização já existe');
    }

    // 2️⃣ hash password uma vez só
    const hashedPassword = await bcrypt.hash(data.organization.password, 10);

    // 3️⃣ criar organização
    const organization = await this.organizationRepository.create({
      ...data.organization,
      password: hashedPassword,
    });

    if (!organization) {
      throw new BadRequestException('Erro ao criar organização');
    }

    // 4️⃣ criar usuário admin da organização
    const user = await this.userRepository.create({
      name: data.representative?.name || data.organization.name,
      email: data.representative?.email || data.organization.email,
      password: hashedPassword,
      organizationId: organization.id,
      role: 'admin',
    });

    if (!user) {
      throw new BadRequestException('Erro ao criar usuário');
    }

    // 5️⃣ gerar tokens
    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      organizationId: organization.id,
      role: 'admin',
    };

    const accessToken = TokenService.generateAccessToken(payload);
    const refreshToken = TokenService.generateRefreshToken(payload);

    // 6️⃣ salvar refresh token
    await this.refreshTokenRepository.create(
      user.id,
      refreshToken,
      TokenService.getRefreshTokenExpirationDate(),
    );

    return {
      success: true,
      accessToken,
      refreshToken,
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
  }
}

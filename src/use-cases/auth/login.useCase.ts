import { TokenService } from '@/modules/auth/services/token.service';
import { RefreshTokenRepository } from '@/modules/auth/repositories/refresh-token.repository';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';
import {
  AuthPayload,
  LoginRequest,
  LoginResponse,
} from '@/modules/auth/entities/auth/auth.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class LoginUseCase {
  constructor(
    private userRepository: IUserRepository,
    private refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(data: LoginRequest): Promise<LoginResponse> {
    const user = await this.userRepository.findByEmail(data.email);

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const match = await bcrypt.compare(data.password, user.password);

    if (!match) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };

    const accessToken = TokenService.generateAccessToken(payload);
    const refreshToken = TokenService.generateRefreshToken(payload);

    await this.refreshTokenRepository.create(
      user.id,
      refreshToken,
      TokenService.getRefreshTokenExpirationDate(),
    );

    return {
      success: true,
      accessToken,
      refreshToken, // ← adicionar
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
  }
}

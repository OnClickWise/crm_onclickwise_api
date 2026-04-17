import { Injectable, UnauthorizedException } from '@nestjs/common';

import { RefreshTokenRepository } from '@/modules/auth/repositories/refresh-token.repository';
import { AuthPayload } from '@/modules/auth/entities/auth/auth.entity';
import { TokenService } from '@/modules/auth/services/token.service';

@Injectable()
export class RefreshUseCase {
  constructor(private refreshTokenRepository: RefreshTokenRepository) {}

  async execute(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token obrigatório');
    }

    let payload: AuthPayload;

    try {
      payload = TokenService.verifyRefreshToken(refreshToken) as AuthPayload;
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const storedToken = await this.refreshTokenRepository.findValidToken(
      payload.userId,
      refreshToken,
    );

    if (!storedToken) {
      // Evita derrubar todas as sessões em corridas de refresh concorrentes.
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    // rotação — remove token antigo
    await this.refreshTokenRepository.deleteById(storedToken.id);

    // criar um novo payload limpo sem exp e iat
    const cleanPayload: AuthPayload = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      email: payload.email,
      role: payload.role,
    };

    const newAccessToken = TokenService.generateAccessToken(cleanPayload);

    const newRefreshToken = TokenService.generateRefreshToken(cleanPayload);

    await this.refreshTokenRepository.create(
      payload.userId,
      newRefreshToken,
      TokenService.getRefreshTokenExpirationDate(),
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }
}

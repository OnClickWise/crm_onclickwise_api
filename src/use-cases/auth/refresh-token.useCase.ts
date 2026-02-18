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
      // possível roubo de token → invalida tudo
      await this.refreshTokenRepository.deleteAllUserTokens(payload.userId);

      throw new UnauthorizedException('Sessão comprometida');
    }

    // rotação — remove token antigo
    await this.refreshTokenRepository.deleteById(storedToken.id);

    const newAccessToken = TokenService.generateAccessToken(payload);

    const newRefreshToken = TokenService.generateRefreshToken(payload);

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

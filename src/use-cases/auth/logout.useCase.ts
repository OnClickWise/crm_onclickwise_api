import { RefreshTokenRepository } from "@/modules/auth/repositories/refresh-token.repository"
import { Injectable } from "@nestjs/common"

@Injectable()
export class LogoutUseCase {
  constructor(
    private refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(userId: string, refreshToken: string) {
    const storedToken =
      await this.refreshTokenRepository.findValidToken(
        userId,
        refreshToken,
      )

    if (storedToken) {
      await this.refreshTokenRepository.deleteById(
        storedToken.id,
      )
    }

    return { success: true }
  }
}

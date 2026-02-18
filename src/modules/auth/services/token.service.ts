import * as jwt from 'jsonwebtoken'
import {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES,
  JWT_REFRESH_EXPIRES,
} from '@/shared/config/config'
import { AuthPayload } from '@/modules/auth/entities/auth/auth.entity'

export class TokenService {
  // =========================
  // ACCESS TOKEN
  // =========================
  static generateAccessToken(payload: AuthPayload) {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_ACCESS_EXPIRES,
    })
  }

  // =========================
  // REFRESH TOKEN
  // =========================
  static generateRefreshToken(payload: AuthPayload) {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES,
    })
  }

  // =========================
  // VERIFY
  // =========================
  static verifyAccessToken(token: string) {
    return jwt.verify(token, JWT_SECRET)
  }

  static verifyRefreshToken(token: string) {
    return jwt.verify(token, JWT_REFRESH_SECRET)
  }

  // =========================
  // ⭐ EXPIRATION HELPERS
  // =========================

  // retorna a data exata de expiração do refresh token
  static getRefreshTokenExpirationDate(): Date {
    return new Date(
      Date.now() + this.parseTimeToMs(JWT_REFRESH_EXPIRES)
    )
  }

  // retorna a data exata de expiração do access token (opcional)
  static getAccessTokenExpirationDate(): Date {
    return new Date(
      Date.now() + this.parseTimeToMs(JWT_ACCESS_EXPIRES)
    )
  }

  // =========================
  // PRIVATE HELPERS
  // =========================
  private static parseTimeToMs(time: string): number {
    const value = parseInt(time, 10)
    const unit = time.replace(value.toString(), '').trim()

    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    }

    if (!units[unit]) {
      throw new Error(`Invalid time format: ${time}`)
    }

    return value * units[unit]
  }
}

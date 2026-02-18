import { Inject, Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'


@Injectable()
export class RefreshTokenRepository {
  constructor(@Inject('Knex') private knex: Knex) {}

  async create(userId: string, token: string, expiresAt: Date) {
    const hashedToken = await bcrypt.hash(token, 10)

    return this.knex('refresh_tokens').insert({
      id: uuid(),
      user_id: userId,
      token: hashedToken,
      expires_at: expiresAt,
    })
  }

  async findValidToken(userId: string, token: string) {
    const tokens = await this.knex('refresh_tokens')
      .where({ user_id: userId })

    for (const stored of tokens) {
      const match = await bcrypt.compare(token, stored.token)

      if (match) return stored
    }

    return null
  }

  async deleteById(id: string) {
    return this.knex('refresh_tokens')
      .where({ id })
      .delete()
  }

  async deleteAllUserTokens(userId: string) {
    return this.knex('refresh_tokens')
      .where({ user_id: userId })
      .delete()
  }
}

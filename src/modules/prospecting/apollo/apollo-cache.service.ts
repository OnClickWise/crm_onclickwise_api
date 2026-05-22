import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { createHash } from 'crypto';

/**
 * Cache de respostas Apollo persistido no Postgres.
 *
 * Por que Postgres em vez de Redis?
 *  - Já temos Postgres, sem nova dependência operacional.
 *  - O cache não precisa de latência sub-ms para esse caso (chamada externa
 *    ao Apollo já leva centenas de ms).
 *  - Persistência sobrevive a restarts.
 *
 * Limpeza: rows expiradas são deletadas no `set()` quando uma nova entrada do
 * mesmo endpoint é gravada (deferred cleanup). Não precisa de cron job dedicado.
 */
@Injectable()
export class ApolloCacheService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  /**
   * Calcula key estável a partir de endpoint + params normalizados.
   * Ordena chaves do objeto para garantir mesma key em qualquer ordem.
   */
  computeKey(endpoint: string, params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return createHash('sha256').update(`${endpoint}::${normalized}`).digest('hex').slice(0, 64);
  }

  async get<T>(key: string): Promise<T | null> {
    const row = await this.knex('prospect_apollo_cache')
      .where({ cache_key: key })
      .andWhere('expires_at', '>', new Date())
      .first();
    if (!row) return null;
    return row.payload as T;
  }

  async set<T>(
    key: string,
    endpoint: string,
    payload: T,
    ttlMs: number = 30 * 24 * 60 * 60 * 1000, // 30 dias
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    // UPSERT
    await this.knex('prospect_apollo_cache')
      .insert({
        cache_key: key,
        endpoint,
        payload: JSON.stringify(payload),
        expires_at: expiresAt,
      })
      .onConflict('cache_key')
      .merge({
        payload: JSON.stringify(payload),
        expires_at: expiresAt,
      });

    // Deferred cleanup: apaga 50 rows expiradas no mesmo endpoint (não-bloqueante).
    this.knex('prospect_apollo_cache')
      .where({ endpoint })
      .andWhere('expires_at', '<=', new Date())
      .limit(50)
      .delete()
      .catch(() => undefined);
  }

  /**
   * Helper que executa um fetch só se a key não estiver em cache.
   * Retorna { data, fromCache } pra audit log saber se gastou crédito.
   */
  async withCache<T>(
    endpoint: string,
    params: Record<string, unknown>,
    fetcher: () => Promise<T>,
    ttlMs?: number,
  ): Promise<{ data: T; fromCache: boolean }> {
    const key = this.computeKey(endpoint, params);
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }
    const data = await fetcher();
    await this.set(key, endpoint, data, ttlMs);
    return { data, fromCache: false };
  }
}

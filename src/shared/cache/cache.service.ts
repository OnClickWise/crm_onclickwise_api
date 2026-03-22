import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory cache service.
 * Para produção com múltiplas instâncias, considere migrar para Redis.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cache = new Map<string, CacheEntry<any>>();

  /**
   * Obtém ou define um valor em cache com TTL
   * @param key - Chave do cache
   * @param factory - Função que retorna o valor se não estiver em cache
   * @param ttlSeconds - Tempo de vida em segundos
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds: number = 300): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      this.logger.debug(`Cache hit: ${key}`);
      return cached.value as T;
    }

    this.logger.debug(`Cache miss: ${key}, fetching from factory...`);
    const value = await factory();

    this.cache.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
    });

    return value;
  }

  /**
   * Define um valor em cache
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
    });
  }

  /**
   * Obtém um valor em cache
   */
  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return cached.value as T;
  }

  /**
   * Limpa um valor do cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Limpa todo o cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.debug(`Cache cleared, removed ${size} entries`);
  }

  /**
   * Retorna todas as chaves em cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Retorna estatísticas do cache
   */
  stats() {
    return {
      size: this.cache.size,
      keys: this.keys(),
    };
  }
}

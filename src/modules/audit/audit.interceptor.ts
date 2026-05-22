import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

interface RequestUser {
  organizationId?: string;
  userId?: string;
  name?: string;
  role?: string;
}

/**
 * Interceptor GLOBAL de auditoria. Registra automaticamente toda requisição
 * que altera dados (POST/PUT/PATCH/DELETE), sem necessidade de tocar em cada
 * serviço. Captura: usuário, organização, rota, status, duração, payload
 * sanitizado, IP e user-agent.
 *
 * Falhas no registro nunca afetam a resposta (fire-and-forget + AuditService
 * é à prova de erro).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private static readonly MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
  private static readonly SENSITIVE_KEYS =
    /pass(word)?|secret|token|api[_-]?key|authorization|smtp_pass/i;

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      originalUrl?: string;
      url?: string;
      params?: Record<string, string>;
      body?: unknown;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      user?: RequestUser;
    }>();

    const method = (req.method ?? 'GET').toUpperCase();
    // Apenas requisições mutantes são auditadas pelo interceptor.
    if (!AuditInterceptor.MUTATING.includes(method)) {
      return next.handle();
    }

    const start = Date.now();
    const rawUrl = req.originalUrl ?? req.url ?? '';
    const path = rawUrl.split('?')[0] ?? '';
    const user = req.user;

    const finalize = (httpStatus: number | null) => {
      const { entityType, entityId } = this.deriveEntity(path, req.params);
      void this.auditService.record({
        organizationId: user?.organizationId ?? null,
        userId: user?.userId ?? null,
        userName: user?.name ?? null,
        userRole: user?.role ?? null,
        action: this.actionFor(method),
        entityType,
        entityId,
        httpMethod: method,
        httpRoute: path,
        httpStatus,
        durationMs: Date.now() - start,
        changes: this.sanitize(req.body),
        ipAddress: this.clientIp(req),
        userAgent: this.headerStr(req.headers?.['user-agent']),
      });
    };

    return next.handle().pipe(
      tap({
        next: () => finalize(http.getResponse<{ statusCode?: number }>()?.statusCode ?? 200),
        error: (err: unknown) => {
          const status =
            typeof (err as { status?: number })?.status === 'number'
              ? (err as { status: number }).status
              : 500;
          finalize(status);
        },
      }),
    );
  }

  private actionFor(method: string): string {
    if (method === 'POST') return 'create';
    if (method === 'PUT' || method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    return 'other';
  }

  /**
   * Deriva entity_type e entity_id da rota. Ex.:
   *   /sales/documents/abc-123/status → type 'sales/documents', id 'abc-123'
   */
  private deriveEntity(
    path: string,
    params?: Record<string, string>,
  ): { entityType: string | null; entityId: string | null } {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const segments = path.split('/').filter((s) => s && s !== 'api');

    const typeSegs: string[] = [];
    let entityId: string | null = null;
    for (const seg of segments) {
      if (uuidRe.test(seg)) {
        if (!entityId) entityId = seg;
      } else if (typeSegs.length < 3) {
        typeSegs.push(seg);
      }
    }
    // params.id tem prioridade se for uuid
    if (params?.id && uuidRe.test(params.id)) entityId = params.id;

    return {
      entityType: typeSegs.length ? typeSegs.slice(0, 2).join('/') : null,
      entityId,
    };
  }

  /** Remove campos sensíveis e limita profundidade/tamanho do payload. */
  private sanitize(body: unknown): unknown {
    if (body == null || typeof body !== 'object') return body ?? null;
    try {
      const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
      const scrub = (obj: Record<string, unknown>) => {
        for (const key of Object.keys(obj)) {
          if (AuditInterceptor.SENSITIVE_KEYS.test(key)) {
            obj[key] = '***';
          } else if (obj[key] && typeof obj[key] === 'object') {
            scrub(obj[key] as Record<string, unknown>);
          }
        }
      };
      scrub(clone);
      const str = JSON.stringify(clone);
      // Limita a 16 KB para não inflar a tabela de auditoria
      if (str.length > 16384) return { _truncated: true, size: str.length };
      return clone;
    } catch {
      return null;
    }
  }

  private clientIp(req: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
  }): string | null {
    const fwd = this.headerStr(req.headers?.['x-forwarded-for']);
    if (fwd) return fwd.split(',')[0]?.trim() ?? null;
    return req.ip ?? null;
  }

  private headerStr(v: string | string[] | undefined): string | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
}

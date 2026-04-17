  import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthPayload } from './entities/auth/auth.entity';
import { TokenService } from './services/token.service';

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookiePart of cookies) {
    const [rawKey, ...rawValueParts] = cookiePart.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValueParts.join('=')) || null;
    }
  }

  return null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers.authorization;
    const bearerToken = typeof authHeader === 'string'
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : null;
    const cookieToken = readCookieValue(request.headers.cookie, 'accessToken');
    const token = (bearerToken && bearerToken !== 'null' && bearerToken !== 'undefined')
      ? bearerToken
      : cookieToken;

    if (!token) throw new UnauthorizedException();
    try {
      const payload = TokenService.verifyAccessToken(token) as AuthPayload;
      request.user = payload;
      return true;
    } catch (error){
      throw new UnauthorizedException('Token inválido');
    }
  }
}

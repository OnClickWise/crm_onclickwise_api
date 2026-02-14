import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthPayload } from './entities/auth/auth.entity';
import { JWT_SECRET } from '@/shared/config/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers.authorization;

    if (!authHeader) throw new UnauthorizedException();

    const token = authHeader.replace('Bearer ', '');

    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}

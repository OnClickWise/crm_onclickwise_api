import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Audit module — trilha de auditoria universal.
 *
 * `@Global()` para que o `AuditService` esteja disponível em qualquer módulo
 * (interceptor global + chamadas explícitas de serviços) sem reimportar.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

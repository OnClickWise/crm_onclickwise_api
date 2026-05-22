import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';

/**
 * Compliance module — LGPD/GDPR (exportação e anonimização de titulares).
 * O AuditService vem do AuditModule (@Global).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}

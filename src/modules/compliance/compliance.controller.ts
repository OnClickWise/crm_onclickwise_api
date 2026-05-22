import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ComplianceService } from './compliance.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string; name?: string };
}

@Controller('compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  /** Exporta todos os dados de um titular (LGPD art. 18 / GDPR art. 15). */
  @Get('data-subject/:customerId/export')
  export(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.exportDataSubject(customerId, req.user);
  }

  /** Anonimiza os dados pessoais de um titular (direito ao esquecimento). */
  @Post('data-subject/:customerId/anonymize')
  anonymize(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.anonymizeDataSubject(customerId, req.user);
  }
}

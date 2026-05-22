import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ProspectingImportService } from './import.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/import')
@UseGuards(JwtAuthGuard)
export class ProspectingImportController {
  constructor(private readonly service: ProspectingImportService) {}

  @Post('person/:id')
  importPerson(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { assignedUserId?: string; status?: string; description?: string },
    @Req() req: AuthRequest,
  ) {
    return this.service.importPersonToLead(id, req.user, body);
  }

  @Post('bulk')
  importBulk(
    @Body() body: { prospectPersonIds: string[]; assignedUserId?: string; status?: string },
    @Req() req: AuthRequest,
  ) {
    return this.service.importManyToLeads(body.prospectPersonIds ?? [], req.user, {
      assignedUserId: body.assignedUserId,
      status: body.status,
    });
  }
}

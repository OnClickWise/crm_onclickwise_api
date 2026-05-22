import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BrandingService } from './branding.service';
import { UpsertBrandingDto } from './dtos/branding.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('communications/branding')
@UseGuards(JwtAuthGuard)
export class BrandingController {
  constructor(private readonly service: BrandingService) {}

  @Get()
  get(@Req() req: AuthRequest) {
    return this.service.get(req.user);
  }

  @Put()
  upsert(@Body() body: UpsertBrandingDto, @Req() req: AuthRequest) {
    return this.service.upsert(body, req.user);
  }
}

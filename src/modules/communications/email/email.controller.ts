import { Body, Controller, Get, Put, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { EmailSettingsService } from './email-settings.service';
import { TestSmtpDto, UpsertEmailSettingsDto } from './dtos/email.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('communications/email-settings')
@UseGuards(JwtAuthGuard)
export class EmailSettingsController {
  constructor(private readonly service: EmailSettingsService) {}

  @Get()
  get(@Req() req: AuthRequest) {
    return this.service.get(req.user);
  }

  @Put()
  upsert(@Body() body: UpsertEmailSettingsDto, @Req() req: AuthRequest) {
    return this.service.upsert(body, req.user);
  }

  @Post('test')
  test(@Body() body: TestSmtpDto, @Req() req: AuthRequest) {
    return this.service.test(body, req.user);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AttachmentsService, CreateAttachmentDto } from './attachments.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('referenceType') referenceType: string,
    @Query('referenceId') referenceId: string,
  ) {
    return this.service.list(referenceType, referenceId, req.user);
  }

  @Post()
  create(@Body() body: CreateAttachmentDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}

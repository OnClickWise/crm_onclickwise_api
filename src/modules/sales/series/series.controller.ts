import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { SalesDocumentSeriesService } from './series.service';
import { CreateSeriesDto, UpdateSeriesDto } from './dtos/series.dto';
import type { SeriesDocType } from './dtos/series.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/document-series')
@UseGuards(JwtAuthGuard)
export class SalesDocumentSeriesController {
  constructor(private readonly service: SalesDocumentSeriesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query('docType') docType?: SeriesDocType) {
    return this.service.list(req.user, docType);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateSeriesDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSeriesDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}

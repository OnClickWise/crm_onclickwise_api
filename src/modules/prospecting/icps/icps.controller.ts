import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ProspectingIcpsService } from './icps.service';
import { CreateIcpDto, UpdateIcpDto } from './dtos/icp.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/icps')
@UseGuards(JwtAuthGuard)
export class ProspectingIcpsController {
  constructor(private readonly service: ProspectingIcpsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe) includeInactive?: boolean,
  ) {
    return this.service.list(req.user, includeInactive);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateIcpDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateIcpDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  /** Recalcula score de UMA pessoa usando o ICP default. */
  @Post('score/person/:personId')
  scorePerson(@Param('personId', ParseUUIDPipe) personId: string, @Req() req: AuthRequest) {
    return this.service.recalculatePerson(personId, req.user);
  }

  /** Recalcula score de TODAS pessoas da org usando o ICP default (bulk). */
  @Post('score/recalculate-all')
  recalcAll(@Req() req: AuthRequest) {
    return this.service.recalculateAll(req.user);
  }
}

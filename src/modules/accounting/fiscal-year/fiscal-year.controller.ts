import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { FiscalYearService } from './fiscal-year.service';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

class CloseDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

class ReopenDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('accounting/fiscal-year')
@UseGuards(JwtAuthGuard)
export class FiscalYearController {
  constructor(private readonly service: FiscalYearService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.service.list(req.user);
  }

  @Get(':year')
  getByYear(@Param('year', ParseIntPipe) year: number, @Req() req: AuthRequest) {
    return this.service.getByYear(year, req.user);
  }

  /** Prévia do encerramento (não persiste). */
  @Get(':year/preview')
  preview(@Param('year', ParseIntPipe) year: number, @Req() req: AuthRequest) {
    return this.service.preview(year, req.user);
  }

  /** Executa o encerramento — gera lançamentos e tranca o exercício. */
  @Post(':year/close')
  close(
    @Param('year', ParseIntPipe) year: number,
    @Body() body: CloseDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.close(year, req.user, body.notes);
  }

  /** Reabre o exercício — gera estornos. Exige motivo. */
  @Post(':year/reopen')
  reopen(
    @Param('year', ParseIntPipe) year: number,
    @Body() body: ReopenDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.reopen(year, body.reason, req.user);
  }
}

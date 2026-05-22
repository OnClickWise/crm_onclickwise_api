import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CustomerCreditService } from './customer-credit.service';

class SetCreditLimitDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limit?: number | null;
}

class BlockCustomerDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/customers')
@UseGuards(JwtAuthGuard)
export class CustomerCreditController {
  constructor(private readonly service: CustomerCreditService) {}

  @Get(':customerId/credit')
  status(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() req: AuthRequest) {
    return this.service.getStatus(customerId, req.user);
  }

  @Put(':customerId/credit/limit')
  setLimit(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: SetCreditLimitDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.setCreditLimit(customerId, body.limit ?? null, req.user);
  }

  @Post(':customerId/credit/block')
  block(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: BlockCustomerDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.block(customerId, body.reason, req.user);
  }

  @Post(':customerId/credit/unblock')
  unblock(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() req: AuthRequest) {
    return this.service.unblock(customerId, req.user);
  }

  @Post('credit/auto-block-overdue')
  autoBlock(
    @Req() req: AuthRequest,
    @Query('minDaysOverdue', new DefaultValuePipe(30)) minDaysOverdue?: number,
    @Query('minOverdueAmount', new DefaultValuePipe(0)) minOverdueAmount?: number,
  ) {
    return this.service.autoBlockOverdue(req.user, {
      minDaysOverdue: Number(minDaysOverdue),
      minOverdueAmount: Number(minOverdueAmount),
    });
  }
}

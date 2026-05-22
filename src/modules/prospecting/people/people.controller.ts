import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ProspectingPeopleService } from './people.service';
import { EnrichPersonDto, PeopleSearchDto } from './dtos/people-search.dto';
import { ApolloPerson } from '../apollo/apollo-api.client';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/people')
@UseGuards(JwtAuthGuard)
export class ProspectingPeopleController {
  constructor(private readonly service: ProspectingPeopleService) {}

  @Post('search')
  search(@Body() body: PeopleSearchDto, @Req() req: AuthRequest) {
    return this.service.searchPeople(body, req.user);
  }

  @Post('enrich')
  enrich(@Body() body: EnrichPersonDto, @Req() req: AuthRequest) {
    return this.service.enrichPerson(body, req.user);
  }

  @Post('save')
  save(
    @Body() body: { apolloPersonId: string; snapshot?: ApolloPerson },
    @Req() req: AuthRequest,
  ) {
    return this.service.saveFromSearch(body.apolloPersonId, req.user, body.snapshot);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('query') query?: string,
    @Query('enrichedOnly', new DefaultValuePipe(false), ParseBoolPipe) enrichedOnly?: boolean,
    @Query('convertedOnly', new DefaultValuePipe(false), ParseBoolPipe) convertedOnly?: boolean,
  ) {
    return this.service.listSaved(req.user, { query, enrichedOnly, convertedOnly, limit });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }
}

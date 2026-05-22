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
import { ProspectingCompaniesService } from './companies.service';
import { CompanyTeamService, DEPARTMENT_BUCKETS, DepartmentBucketId } from './company-team.service';
import { CompanySearchDto, EnrichCompanyDto } from './dtos/company-search.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/companies')
@UseGuards(JwtAuthGuard)
export class ProspectingCompaniesController {
  constructor(
    private readonly service: ProspectingCompaniesService,
    private readonly teamService: CompanyTeamService,
  ) {}

  @Post('search')
  search(@Body() body: CompanySearchDto, @Req() req: AuthRequest) {
    return this.service.searchCompanies(body, req.user);
  }

  @Post('enrich')
  enrich(@Body() body: EnrichCompanyDto, @Req() req: AuthRequest) {
    return this.service.enrichCompany(body, req.user);
  }

  /**
   * Salva empresa a partir do SNAPSHOT (objeto retornado pela busca) — sem crédito.
   * Endpoint preferido. Body: { snapshot: ApolloOrganization }
   */
  @Post('save')
  save(@Body() body: { snapshot: import('../apollo/apollo-api.client').ApolloOrganization }, @Req() req: AuthRequest) {
    return this.service.saveFromSnapshot(body.snapshot, req.user);
  }

  /**
   * Compat: legado — aceita só apolloOrgId. Falha hoje, força o cliente a enviar
   * snapshot via POST /save.
   */
  @Post('save/:apolloOrgId')
  saveLegacy(@Param('apolloOrgId') apolloOrgId: string, @Req() req: AuthRequest) {
    return this.service.saveFromSearch(apolloOrgId, req.user);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('query') query?: string,
    @Query('enrichedOnly', new DefaultValuePipe(false), ParseBoolPipe) enrichedOnly?: boolean,
  ) {
    return this.service.listSaved(req.user, { query, enrichedOnly, limit });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  /**
   * Retorna o "organograma" da empresa agrupado por departamento.
   * Não consome créditos (só search, que é gratuita). Cache 24h por bucket.
   *
   * GET /prospecting/companies/:id/team?buckets=leadership,sales,...&perBucket=10
   */
  @Get(':id/team')
  team(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Query('buckets') buckets?: string,
    @Query('perBucket', new DefaultValuePipe(10), ParseIntPipe) perBucket?: number,
  ) {
    const onlyBuckets = buckets
      ?.split(',')
      .map((s) => s.trim())
      .filter((s): s is DepartmentBucketId => s in DEPARTMENT_BUCKETS);
    return this.teamService.getTeam(id, req.user, { onlyBuckets, perBucket });
  }
}

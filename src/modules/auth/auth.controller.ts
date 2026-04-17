import { Controller, Post, Body, UseGuards, Req, Get, Put, Delete, Query, Res, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { LoginUseCase } from '@/use-cases/auth/login.useCase';
import { RegisterUseCase } from '@/use-cases/auth/register.useCase';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogoutUseCase } from '@/use-cases/auth/logout.useCase';
import { RefreshUseCase } from '@/use-cases/auth/refresh-token.useCase';
import { GetProfileUseCase } from '@/use-cases/auth/get-profile.useCase';
import { GetEmployeesUseCase } from '@/use-cases/auth/get-employees.useCase';
import { CreateEmployeeUseCase } from '@/use-cases/auth/create-employee.useCase';
import { UpdateEmployeeUseCase } from '@/use-cases/auth/update-employee.useCase';
import { DeleteEmployeeUseCase } from '@/use-cases/auth/delete-employee.useCase';
import { OrganizationService } from '../organization/organization.service';
import { clearAuthCookies, readCookieValue, setAuthCookies } from './auth-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(
    private loginUseCase: LoginUseCase,
    private registerUseCase: RegisterUseCase,
    private refreshUseCase: RefreshUseCase,
    private getProfileUseCase: GetProfileUseCase,
    private logoutUseCase: LogoutUseCase,
    private getEmployeesUseCase: GetEmployeesUseCase,
    private createEmployeeUseCase: CreateEmployeeUseCase,
    private updateEmployeeUseCase: UpdateEmployeeUseCase,
    private deleteEmployeeUseCase: DeleteEmployeeUseCase,
    private organizationService: OrganizationService,
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.loginUseCase.execute(body);
    setAuthCookies(reply, result.accessToken!, result.refreshToken!);
    return {
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      organization: result.organization,
    };
  }

  @Post('check-company-by-slug')
  async checkCompanyBySlug(@Body() body: { slug: string }) {
    const organization = await this.organizationService.findBySlug(body.slug);
    return {
      success: true,
      company: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req) {
    return this.getProfileUseCase.execute(req.user.userId);
  }

  @Post('register')
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.registerUseCase.execute(body);
    setAuthCookies(reply, result.accessToken!, result.refreshToken!);
    return {
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      organization: result.organization,
    };
  }

  @Post('refresh')
  async refresh(@Req() req, @Body('refreshToken') token: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const refreshToken = token || readCookieValue(req.headers.cookie, 'refreshToken');
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token obrigatório');
    }

    const result = await this.refreshUseCase.execute(refreshToken);
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return {
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req, @Body('refreshToken') refreshToken: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const tokenToRevoke = refreshToken || readCookieValue(req.headers.cookie, 'refreshToken');
    if (!tokenToRevoke) {
      throw new UnauthorizedException('Refresh token obrigatório');
    }

    await this.logoutUseCase.execute(req.user.userId, tokenToRevoke);
    clearAuthCookies(reply);
    return { success: true };
  }

  @Get('employees')
  @UseGuards(JwtAuthGuard)
  async getEmployees(@Req() req, @Query('include_master') includeMaster: string) {
    return this.getEmployeesUseCase.execute(req.user.organizationId, includeMaster === 'true');
  }

  @Post('create-employee')
  @UseGuards(JwtAuthGuard)
  async createEmployee(@Req() req, @Body() body: { name: string; email: string; password: string; role: string }) {
    return this.createEmployeeUseCase.execute(req.user.organizationId, body);
  }

  @Put('update-employee')
  @UseGuards(JwtAuthGuard)
  async updateEmployee(@Req() req, @Body() body: { id: string; name?: string; email?: string; role?: string }) {
    return this.updateEmployeeUseCase.execute(req.user.organizationId, body);
  }

  @Delete('delete-employee')
  @UseGuards(JwtAuthGuard)
  async deleteEmployee(@Req() req, @Body() body: { id: string }) {
    return this.deleteEmployeeUseCase.execute(req.user.organizationId, body);
  }
}

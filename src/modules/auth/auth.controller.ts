import { Controller, Post, Body, UseGuards, Req, Get, Put, Delete, Query } from '@nestjs/common';
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
  async login(@Body() body: LoginDto) {
    return this.loginUseCase.execute(body);
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
  async register(@Body() body: RegisterDto) {
    return this.registerUseCase.execute(body);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) {
    return this.refreshUseCase.execute(token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req, @Body('refreshToken') refreshToken: string) {
    return this.logoutUseCase.execute(req.user.userId, refreshToken);
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

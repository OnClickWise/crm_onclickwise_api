import { Controller, Post, Body, UseGuards, Req, Get, Put, Delete, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { LoginUseCase } from '@/use-cases/auth/login.useCase';
import { RegisterUseCase } from '@/use-cases/auth/register.useCase';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogoutUseCase } from '@/use-cases/auth/logout.useCase';
import { RefreshUseCase } from '@/use-cases/auth/refresh-token.useCase';
import { GetProfileUseCase } from '@/use-cases/auth/get-profile.useCase';
import { IUserRepository } from './repositories/interface/user.repository.interface';
import * as bcrypt from 'bcrypt';

@Controller('auth')
export class AuthController {
  constructor(
    private loginUseCase: LoginUseCase,
    private registerUseCase: RegisterUseCase,
    private refreshUseCase: RefreshUseCase,
    private getProfileUseCase: GetProfileUseCase,
    private logoutUseCase: LogoutUseCase,
    private userRepository: IUserRepository,
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.loginUseCase.execute(body);
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
    const employees = await this.userRepository.findByOrganizationId(
      req.user.organizationId,
      includeMaster === 'true',
    );
    return { success: true, employees };
  }

  @Post('create-employee')
  @UseGuards(JwtAuthGuard)
  async createEmployee(@Req() req, @Body() body: { name: string; email: string; password: string; role: string }) {
    if (!body.name || !body.email || !body.password) {
      throw new BadRequestException('name, email e password são obrigatórios');
    }

    const existing = await this.userRepository.findByEmail(body.email);
    if (existing) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);
    const user = await this.userRepository.create({
      name: body.name,
      email: body.email,
      password: hashedPassword,
      organizationId: req.user.organizationId,
      role: body.role || 'employee',
    });

    return {
      success: true,
      employee: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    };
  }

  @Put('update-employee')
  @UseGuards(JwtAuthGuard)
  async updateEmployee(@Req() req, @Body() body: { id: string; name?: string; email?: string; role?: string }) {
    if (!body.id) {
      throw new BadRequestException('id é obrigatório');
    }

    const existing = await this.userRepository.findById(body.id);
    if (!existing || existing.organization_id !== req.user.organizationId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const updated = await this.userRepository.update(body.id, {
      name: body.name,
      email: body.email,
      role: body.role,
    });

    return { success: true, employee: updated };
  }

  @Delete('delete-employee')
  @UseGuards(JwtAuthGuard)
  async deleteEmployee(@Req() req, @Body() body: { id: string }) {
    if (!body.id) {
      throw new BadRequestException('id é obrigatório');
    }

    const existing = await this.userRepository.findById(body.id);
    if (!existing || existing.organization_id !== req.user.organizationId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    await this.userRepository.deleteById(body.id);
    return { success: true };
  }
}

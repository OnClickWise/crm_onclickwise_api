import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { LoginUseCase } from '@/use-cases/auth/login.useCase';
import { RegisterUseCase } from '@/use-cases/auth/register.useCase';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogoutUseCase } from '@/use-cases/auth/logout.useCase';
import { RefreshUseCase } from '@/use-cases/auth/refresh-token.useCase';
import { GetProfileUseCase } from '@/use-cases/auth/get-profile.useCase';

@Controller('auth')
export class AuthController {
  constructor(
    private loginUseCase: LoginUseCase,
    private registerUseCase: RegisterUseCase,
    private refreshUseCase: RefreshUseCase,
    private getProfileUseCase: GetProfileUseCase,
    private logoutUseCase: LogoutUseCase,
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    console.log(body);
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
}

import { Controller, Post, Body } from '@nestjs/common';
import { LoginUseCase } from '@/use-cases/auth/login.useCase';
import { RegisterUseCase } from '@/use-cases/auth/register.useCase';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private loginUseCase: LoginUseCase,
    private registerUseCase: RegisterUseCase,
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    console.log(body);
    return this.loginUseCase.execute(body);
  }

  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.registerUseCase.execute(body);
  }
}

import { IsEmail, IsString } from 'class-validator';
import { LoginRequest } from '../entities/auth/auth.entity';


export class LoginDto implements LoginRequest {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

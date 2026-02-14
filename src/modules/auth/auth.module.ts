import { Module } from '@nestjs/common';

import { LoginUseCase } from '@/use-cases/auth/login.useCase';
import { RegisterUseCase } from '@/use-cases/auth/register.useCase';

import { UserRepository } from './repositories/user.repository';

import { OrganizationRepository } from './repositories/organization.repository';
import { AuthController } from './auth.controller';
import { IUserRepository } from './repositories/interface/user.repository.interface';
import { IOrganizationRepository } from './repositories/interface/organization.repository.interface';
import { DatabaseModule } from '@/shared/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    RegisterUseCase,

    {
      provide: IUserRepository,
      useClass: UserRepository,
    },

    {
      provide: IOrganizationRepository,
      useClass: OrganizationRepository,
    },
  ],
  exports: [],
})
export class AuthModule {}

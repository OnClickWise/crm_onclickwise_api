import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';

@Injectable()
export class CreateEmployeeUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(organizationId: string, body: { name: string; email: string; password: string; role: string }) {
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
      organizationId,
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
}

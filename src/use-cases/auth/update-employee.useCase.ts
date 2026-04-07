import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';

@Injectable()
export class UpdateEmployeeUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(
    organizationId: string,
    body: { id: string; name?: string; email?: string; role?: string },
  ) {
    if (!body.id) {
      throw new BadRequestException('id é obrigatório');
    }

    const existing = await this.userRepository.findById(body.id);
    if (!existing || existing.organization_id !== organizationId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const updated = await this.userRepository.update(body.id, {
      name: body.name,
      email: body.email,
      role: body.role,
    });

    return { success: true, employee: updated };
  }
}

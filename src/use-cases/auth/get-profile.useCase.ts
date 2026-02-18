import { Injectable, NotFoundException } from '@nestjs/common'
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface'

@Injectable()
export class GetProfileUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(userId: string) {
    const user = await this.userRepository.findById(userId)

    if (!user) {
      throw new NotFoundException('Usuário não encontrado')
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      organization: user.organization,
    }
  }
}

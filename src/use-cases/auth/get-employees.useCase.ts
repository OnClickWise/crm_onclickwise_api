import { Injectable } from '@nestjs/common';
import { IUserRepository } from '@/modules/auth/repositories/interface/user.repository.interface';

@Injectable()
export class GetEmployeesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(organizationId: string, includeMaster: boolean) {
    const employees = await this.userRepository.findByOrganizationId(organizationId, includeMaster);
    return { success: true, employees };
  }
}

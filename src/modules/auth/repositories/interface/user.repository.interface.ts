export abstract class IUserRepository {
  abstract findByEmail(email: string): Promise<any | null>;

  abstract create(data: {
    name: string;
    email: string;
    password: string
    organizationId: string;
    role: string;
  }): Promise<any>;

  abstract findById(id: string): Promise<any | null>;
}

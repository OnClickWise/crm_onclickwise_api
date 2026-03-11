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

  abstract findByOrganizationId(organizationId: string, includeMaster?: boolean): Promise<any[]>;

  abstract update(id: string, data: { name?: string; email?: string; role?: string }): Promise<any>;

  abstract deleteById(id: string): Promise<void>;
}

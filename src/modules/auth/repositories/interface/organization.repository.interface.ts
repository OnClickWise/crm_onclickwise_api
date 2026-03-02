export abstract class IOrganizationRepository {
  abstract findBySlug(slug: string): Promise<any | null>;

  abstract create(data: {
    name: string;
    slug: string;
    email: string;
    company_id: string;
    password: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    logo_url?: string;
  }): Promise<any>;
}

// =======================
// AUTH CORE
// =======================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  accessToken?: string;

  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    is_temporary_password?: boolean;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    email: string;
  };
  error?: string;
}

export interface RegisterRequest {
  organization: {
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
  };
  representative: {
    name: string;
    email: string;
    position: string;
    ssn: string;
  };
}

export interface RegisterResponse {
  success: boolean;
  accessToken?: string;

  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    is_temporary_password?: boolean;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    email: string;
  };
  error?: string;
}

// =======================
// TOKEN
// =======================

export interface AuthPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

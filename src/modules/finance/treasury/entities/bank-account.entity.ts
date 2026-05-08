/**
 * Conta de tesouraria (caixa OU conta bancária).
 * O campo `account_type` distingue: 'cash' (caixa físico) vs 'checking' / 'savings' / 'investment'.
 */
export interface BankAccount {
  id: string;
  organization_id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  account_holder: string;
  current_balance: number | string;
  available_balance: number | string;
  is_active: boolean;
  currency: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

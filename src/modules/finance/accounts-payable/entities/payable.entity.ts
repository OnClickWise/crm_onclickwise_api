export interface Payable {
  id: string;
  organization_id: string;
  supplier_id: string | null;
  supplier_name: string;
  original_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  issue_date: Date;
  due_date: Date;
  status: 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  description: string | null;
  reference_number: string | null;
  reference_type: string | null;
  reference_id: string | null;
  allows_partial_payment: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayablePayment {
  id: string;
  payable_id: string;
  organization_id: string;
  amount: number;
  payment_date: Date;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
}

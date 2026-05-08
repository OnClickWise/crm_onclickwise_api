import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { Payable, PayablePayment } from '../entities/payable.entity';

@Injectable()
export class PayableRepository {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  async create(organizationId: string, data: any, userId: string): Promise<Payable> {
    const id = randomUUID();
    const now = new Date();

    const [payable] = await this.knex('accounts_payable')
      .insert({
        id,
        organization_id: organizationId,
        supplier_id: data.supplierId || null,
        supplier_name: data.supplierName,
        original_amount: Number(data.originalAmount),
        paid_amount: 0,
        outstanding_amount: Number(data.originalAmount),
        issue_date: now,
        due_date: new Date(data.dueDate),
        status: 'issued',
        description: data.description || null,
        reference_number: data.referenceNumber || null,
        reference_type: data.referenceType || null,
        reference_id: data.referenceId || null,
        allows_partial_payment: data.allowsPartialPayment !== false,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    return payable;
  }

  async findById(id: string, organizationId: string): Promise<Payable | null> {
    return this.knex('accounts_payable')
      .where({ id, organization_id: organizationId })
      .first();
  }

  async findByOrganization(organizationId: string, limit = 100): Promise<Payable[]> {
    return this.knex('accounts_payable')
      .where({ organization_id: organizationId })
      .orderBy('due_date', 'asc')
      .limit(limit);
  }

  async findByStatus(organizationId: string, status: string): Promise<Payable[]> {
    return this.knex('accounts_payable')
      .where({ organization_id: organizationId, status })
      .orderBy('due_date', 'asc');
  }

  async update(id: string, organizationId: string, data: any, userId: string): Promise<Payable> {
    const now = new Date();
    const [updated] = await this.knex('accounts_payable')
      .where({ id, organization_id: organizationId })
      .update({
        ...(data.supplierName && { supplier_name: data.supplierName }),
        ...(data.dueDate && { due_date: new Date(data.dueDate) }),
        ...(data.description && { description: data.description }),
        ...(data.status && { status: data.status }),
        updated_by: userId,
        updated_at: now,
      })
      .returning('*');

    if (!updated) {
      throw new NotFoundException('Payable not found');
    }

    return updated;
  }

  async recordPayment(
    payableId: string,
    organizationId: string,
    amount: number,
    paymentData: any,
    userId: string,
  ): Promise<PayablePayment> {
    const payable = await this.findById(payableId, organizationId);
    if (!payable) {
      throw new NotFoundException('Payable not found');
    }

    if (!payable.allows_partial_payment && Number(amount) < Number(payable.outstanding_amount)) {
      throw new Error('Partial payment not allowed for this payable');
    }

    const paymentId = randomUUID();
    const now = new Date();

    // Create payment record
    const [payment] = await this.knex('payable_payments')
      .insert({
        id: paymentId,
        payable_id: payableId,
        organization_id: organizationId,
        amount: Number(amount),
        payment_date: new Date(paymentData.paymentDate),
        payment_method: paymentData.paymentMethod || null,
        payment_reference: paymentData.paymentReference || null,
        notes: paymentData.notes || null,
        created_by: userId,
        created_at: now,
      })
      .returning('*');

    // Update payable amounts and status
    const newPaidAmount = Number(payable.paid_amount) + Number(amount);
    const newOutstanding = Number(payable.original_amount) - newPaidAmount;
    const newStatus = newOutstanding <= 0 ? 'paid' : 'partial';

    await this.knex('accounts_payable').where({ id: payableId }).update({
      paid_amount: newPaidAmount,
      outstanding_amount: Math.max(0, newOutstanding),
      status: newStatus,
      updated_by: userId,
      updated_at: now,
    });

    return payment;
  }

  async getPayments(payableId: string, organizationId: string): Promise<PayablePayment[]> {
    return this.knex('payable_payments')
      .where({ payable_id: payableId, organization_id: organizationId })
      .orderBy('payment_date', 'desc');
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.knex('accounts_payable').where({ id, organization_id: organizationId }).delete();
  }
}

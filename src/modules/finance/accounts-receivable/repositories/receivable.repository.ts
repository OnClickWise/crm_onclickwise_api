import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { Receivable, ReceivablePayment } from '../entities/receivable.entity';

@Injectable()
export class ReceivableRepository {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  async create(organizationId: string, data: any, userId: string): Promise<Receivable> {
    const id = randomUUID();
    const now = new Date();

    const [receivable] = await this.knex('accounts_receivable')
      .insert({
        id,
        organization_id: organizationId,
        customer_id: data.customerId || null,
        customer_name: data.customerName,
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
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    return receivable;
  }

  async findById(id: string, organizationId: string): Promise<Receivable | null> {
    return this.knex('accounts_receivable')
      .where({ id, organization_id: organizationId })
      .first();
  }

  async findByOrganization(organizationId: string, limit = 100): Promise<Receivable[]> {
    return this.knex('accounts_receivable')
      .where({ organization_id: organizationId })
      .orderBy('due_date', 'asc')
      .limit(limit);
  }

  async findByStatus(organizationId: string, status: string): Promise<Receivable[]> {
    return this.knex('accounts_receivable')
      .where({ organization_id: organizationId, status })
      .orderBy('due_date', 'asc');
  }

  async update(id: string, organizationId: string, data: any, userId: string): Promise<Receivable> {
    const now = new Date();
    const [updated] = await this.knex('accounts_receivable')
      .where({ id, organization_id: organizationId })
      .update({
        ...(data.customerName && { customer_name: data.customerName }),
        ...(data.dueDate && { due_date: new Date(data.dueDate) }),
        ...(data.description && { description: data.description }),
        ...(data.status && { status: data.status }),
        updated_by: userId,
        updated_at: now,
      })
      .returning('*');

    if (!updated) {
      throw new NotFoundException('Receivable not found');
    }

    return updated;
  }

  async recordPayment(
    receivableId: string,
    organizationId: string,
    amount: number,
    paymentData: any,
    userId: string,
  ): Promise<ReceivablePayment> {
    const receivable = await this.findById(receivableId, organizationId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }

    const paymentId = randomUUID();
    const now = new Date();

    // Create payment record
    const [payment] = await this.knex('receivable_payments')
      .insert({
        id: paymentId,
        receivable_id: receivableId,
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

    // Update receivable amounts and status
    const newPaidAmount = Number(receivable.paid_amount) + Number(amount);
    const newOutstanding = Number(receivable.original_amount) - newPaidAmount;
    const newStatus = newOutstanding <= 0 ? 'paid' : 'partial';

    await this.knex('accounts_receivable').where({ id: receivableId }).update({
      paid_amount: newPaidAmount,
      outstanding_amount: Math.max(0, newOutstanding),
      status: newStatus,
      updated_by: userId,
      updated_at: now,
    });

    return payment;
  }

  async getPayments(receivableId: string, organizationId: string): Promise<ReceivablePayment[]> {
    return this.knex('receivable_payments')
      .where({ receivable_id: receivableId, organization_id: organizationId })
      .orderBy('payment_date', 'desc');
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.knex('accounts_receivable').where({ id, organization_id: organizationId }).delete();
  }
}

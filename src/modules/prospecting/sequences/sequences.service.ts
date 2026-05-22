import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  CompleteExecutionDto,
  CreateSequenceDto,
  CreateStepDto,
  EnrollPeopleDto,
  EnrollmentStatus,
  SequenceStatus,
  StepType,
  UpdateEnrollmentDto,
  UpdateSequenceDto,
  UpdateStepDto,
} from './dtos/sequence.dto';

interface AuthScope {
  organizationId: string;
  userId: string;
  role: string;
}

interface AuthUserPayload {
  organizationId?: string;
  userId?: string;
  role?: string;
}

const WRITE_ROLES = ['master', 'admin', 'sales', 'sdr', 'manager'] as const;
const READ_ROLES = [...WRITE_ROLES, 'employee'] as const;

export interface SequenceRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string;
  status: SequenceStatus;
  settings: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StepRow {
  id: string;
  organization_id: string;
  sequence_id: string;
  step_order: number;
  step_type: StepType;
  wait_days: number;
  subject: string | null;
  body_template: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnrollmentRow {
  id: string;
  organization_id: string;
  sequence_id: string;
  person_id: string;
  status: EnrollmentStatus;
  current_step_order: number;
  next_action_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  pause_reason: string | null;
  assigned_user_id: string | null;
  enrolled_by: string | null;
  enrolled_at: Date;
  updated_at: Date;
}

export interface ExecutionRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  step_id: string;
  status: 'pending' | 'completed' | 'skipped' | 'failed';
  scheduled_for: Date;
  executed_at: Date | null;
  outcome_notes: string | null;
  executed_by: string | null;
  created_at: Date;
}

/**
 * Cadências (sequences) multi-touch:
 * - Sequence agrupa steps; steps definem a "régua" (D0 email, D3 LinkedIn, ...).
 * - Enrollment liga uma pessoa à cadência. Idempotente (unique sequence_id+person_id).
 * - Executions registram cada disparo (pendente/completo/skipped/failed).
 *
 * Ao inscrever uma pessoa numa cadência ATIVA, agendamos o primeiro step
 * (executions com status pending + scheduled_for). Ao "completar" um step,
 * agendamos o próximo respeitando wait_days (e skip_weekends das settings).
 */
@Injectable()
export class ProspectingSequencesService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }

  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para gerenciar cadências');
    }
  }

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar cadências');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SEQUENCES CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async list(user: AuthUserPayload, status?: SequenceStatus) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const rows = await this.knex<SequenceRow>('prospect_sequences')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (status) q.andWhere({ status });
      })
      .orderBy('updated_at', 'desc');

    if (rows.length === 0) return [];

    // Estatísticas em batch (steps + enrollments por status).
    const ids = rows.map((r) => r.id);
    const stepCounts = await this.knex('prospect_sequence_steps')
      .whereIn('sequence_id', ids)
      .groupBy('sequence_id')
      .select('sequence_id')
      .count<{ sequence_id: string; count: string }[]>('* as count');
    const enrollCounts = await this.knex('prospect_sequence_enrollments')
      .whereIn('sequence_id', ids)
      .groupBy('sequence_id', 'status')
      .select('sequence_id', 'status')
      .count<{ sequence_id: string; status: string; count: string }[]>('* as count');

    const stepMap = new Map(stepCounts.map((s) => [s.sequence_id, Number(s.count)]));
    const enrollMap = new Map<string, Record<string, number>>();
    for (const e of enrollCounts) {
      const cur = enrollMap.get(e.sequence_id) ?? {};
      cur[e.status] = Number(e.count);
      enrollMap.set(e.sequence_id, cur);
    }

    return rows.map((r) => ({
      ...r,
      stats: {
        stepCount: stepMap.get(r.id) ?? 0,
        enrollments: enrollMap.get(r.id) ?? {},
      },
    }));
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const seq = await this.knex<SequenceRow>('prospect_sequences')
      .where({ id, organization_id: organizationId })
      .first();
    if (!seq) throw new NotFoundException('Cadência não encontrada');

    const steps = await this.knex<StepRow>('prospect_sequence_steps')
      .where({ sequence_id: id })
      .orderBy('step_order', 'asc');

    return { ...seq, steps };
  }

  async create(dto: CreateSequenceDto, user: AuthUserPayload): Promise<SequenceRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    const id = randomUUID();
    const now = new Date();
    await this.knex('prospect_sequences').insert({
      id,
      organization_id: organizationId,
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? '#6366F1',
      status: dto.status ?? 'draft',
      settings: JSON.stringify(dto.settings ?? { skip_weekends: true, stop_on_reply: true }),
      created_by: userId,
      updated_by: userId,
      created_at: now,
      updated_at: now,
    });

    return (await this.knex<SequenceRow>('prospect_sequences').where({ id }).first()) as SequenceRow;
  }

  async update(id: string, dto: UpdateSequenceDto, user: AuthUserPayload): Promise<SequenceRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    const existing = await this.knex<SequenceRow>('prospect_sequences')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Cadência não encontrada');

    await this.knex('prospect_sequences')
      .where({ id, organization_id: organizationId })
      .update({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.settings !== undefined && { settings: JSON.stringify(dto.settings) }),
        updated_by: userId,
        updated_at: new Date(),
      });

    return (await this.knex<SequenceRow>('prospect_sequences').where({ id }).first()) as SequenceRow;
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);
    const deleted = await this.knex('prospect_sequences')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Cadência não encontrada');
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEPS
  // ═══════════════════════════════════════════════════════════════════════

  async addStep(sequenceId: string, dto: CreateStepDto, user: AuthUserPayload): Promise<StepRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const seq = await trx<SequenceRow>('prospect_sequences')
        .where({ id: sequenceId, organization_id: organizationId })
        .first();
      if (!seq) throw new NotFoundException('Cadência não encontrada');

      let order = dto.stepOrder;
      if (order == null) {
        const last = await trx('prospect_sequence_steps')
          .where({ sequence_id: sequenceId })
          .max<{ max: number | null }[]>('step_order as max')
          .first();
        order = (last?.max ?? 0) + 1;
      } else {
        // Se inserindo no meio, abre espaço (step_order +=1 dos posteriores).
        await trx('prospect_sequence_steps')
          .where({ sequence_id: sequenceId })
          .andWhere('step_order', '>=', order)
          .increment('step_order', 1);
      }

      const id = randomUUID();
      const now = new Date();
      await trx('prospect_sequence_steps').insert({
        id,
        organization_id: organizationId,
        sequence_id: sequenceId,
        step_order: order,
        step_type: dto.stepType,
        wait_days: dto.waitDays ?? 0,
        subject: dto.subject ?? null,
        body_template: dto.bodyTemplate ?? null,
        notes: dto.notes ?? null,
        created_at: now,
        updated_at: now,
      });

      return (await trx<StepRow>('prospect_sequence_steps').where({ id }).first()) as StepRow;
    });
  }

  async updateStep(
    sequenceId: string,
    stepId: string,
    dto: UpdateStepDto,
    user: AuthUserPayload,
  ): Promise<StepRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const existing = await this.knex<StepRow>('prospect_sequence_steps')
      .where({ id: stepId, sequence_id: sequenceId, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Step não encontrado');

    await this.knex('prospect_sequence_steps')
      .where({ id: stepId })
      .update({
        ...(dto.stepOrder !== undefined && { step_order: dto.stepOrder }),
        ...(dto.stepType !== undefined && { step_type: dto.stepType }),
        ...(dto.waitDays !== undefined && { wait_days: dto.waitDays }),
        ...(dto.subject !== undefined && { subject: dto.subject ?? null }),
        ...(dto.bodyTemplate !== undefined && { body_template: dto.bodyTemplate ?? null }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        updated_at: new Date(),
      });

    return (await this.knex<StepRow>('prospect_sequence_steps')
      .where({ id: stepId })
      .first()) as StepRow;
  }

  async removeStep(
    sequenceId: string,
    stepId: string,
    user: AuthUserPayload,
  ): Promise<{ success: boolean }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<StepRow>('prospect_sequence_steps')
        .where({ id: stepId, sequence_id: sequenceId, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Step não encontrado');

      await trx('prospect_sequence_steps').where({ id: stepId }).delete();
      // Compacta ordens (decrementa posteriores).
      await trx('prospect_sequence_steps')
        .where({ sequence_id: sequenceId })
        .andWhere('step_order', '>', existing.step_order)
        .decrement('step_order', 1);

      return { success: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENROLLMENTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Inscreve até 500 pessoas. Idempotente: pessoas já inscritas (qualquer status)
   * são ignoradas. Retorna stats {created, skipped}.
   */
  async enrollPeople(
    sequenceId: string,
    dto: EnrollPeopleDto,
    user: AuthUserPayload,
  ): Promise<{ created: number; skipped: number }> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const seq = await trx<SequenceRow>('prospect_sequences')
        .where({ id: sequenceId, organization_id: organizationId })
        .first();
      if (!seq) throw new NotFoundException('Cadência não encontrada');
      if (seq.status === 'archived') {
        throw new BadRequestException('Não é possível inscrever em cadência arquivada');
      }

      // Valida que pessoas pertencem à org
      const validPeople = await trx('prospect_people')
        .whereIn('id', dto.personIds)
        .andWhere({ organization_id: organizationId })
        .select<{ id: string }[]>('id');
      const validIds = new Set(validPeople.map((p) => p.id));

      // Pessoas já inscritas
      const already = await trx('prospect_sequence_enrollments')
        .where({ sequence_id: sequenceId })
        .whereIn('person_id', dto.personIds)
        .select<{ person_id: string }[]>('person_id');
      const alreadySet = new Set(already.map((a) => a.person_id));

      const toEnroll = dto.personIds.filter((id) => validIds.has(id) && !alreadySet.has(id));

      if (toEnroll.length === 0) {
        return { created: 0, skipped: dto.personIds.length };
      }

      // Pega o primeiro step (menor step_order) para agendar próxima ação.
      const firstStep = await trx<StepRow>('prospect_sequence_steps')
        .where({ sequence_id: sequenceId })
        .orderBy('step_order', 'asc')
        .first();

      const now = new Date();
      const settings = (typeof seq.settings === 'string'
        ? JSON.parse(seq.settings)
        : seq.settings) as { skip_weekends?: boolean };
      const firstScheduled = firstStep
        ? this.computeScheduledDate(now, firstStep.wait_days, settings.skip_weekends ?? true)
        : null;

      const enrollmentRows = toEnroll.map((personId) => ({
        id: randomUUID(),
        organization_id: organizationId,
        sequence_id: sequenceId,
        person_id: personId,
        status: 'active' as EnrollmentStatus,
        current_step_order: firstStep ? firstStep.step_order : 0,
        next_action_at: firstScheduled,
        assigned_user_id: dto.assignedUserId ?? null,
        enrolled_by: userId,
        enrolled_at: now,
        updated_at: now,
      }));

      await trx('prospect_sequence_enrollments').insert(enrollmentRows);

      // Cria executions do primeiro step (se houver)
      if (firstStep && firstScheduled) {
        const executionRows = enrollmentRows.map((e) => ({
          id: randomUUID(),
          organization_id: organizationId,
          enrollment_id: e.id,
          step_id: firstStep.id,
          status: 'pending' as const,
          scheduled_for: firstScheduled,
          created_at: now,
        }));
        await trx('prospect_sequence_step_executions').insert(executionRows);
      }

      return {
        created: toEnroll.length,
        skipped: dto.personIds.length - toEnroll.length,
      };
    });
  }

  async listEnrollments(
    sequenceId: string,
    user: AuthUserPayload,
    status?: EnrollmentStatus,
  ): Promise<
    Array<
      EnrollmentRow & {
        person_name: string | null;
        person_email: string | null;
        person_title: string | null;
      }
    >
  > {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    return this.knex('prospect_sequence_enrollments as e')
      .leftJoin('prospect_people as p', 'e.person_id', 'p.id')
      .where('e.sequence_id', sequenceId)
      .andWhere('e.organization_id', organizationId)
      .modify((q) => {
        if (status) q.andWhere('e.status', status);
      })
      .select(
        'e.*',
        { person_name: 'p.name' },
        { person_email: 'p.email' },
        { person_title: 'p.title' },
      )
      .orderBy('e.enrolled_at', 'desc');
  }

  async updateEnrollment(
    enrollmentId: string,
    dto: UpdateEnrollmentDto,
    user: AuthUserPayload,
  ): Promise<EnrollmentRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const existing = await this.knex<EnrollmentRow>('prospect_sequence_enrollments')
      .where({ id: enrollmentId, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Inscrição não encontrada');

    const patch: Partial<EnrollmentRow> = { updated_at: new Date() };
    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (dto.status === 'paused') patch.paused_at = new Date();
      if (dto.status === 'active') patch.paused_at = null;
      if (['completed', 'replied', 'unsubscribed', 'failed'].includes(dto.status)) {
        patch.completed_at = new Date();
        patch.next_action_at = null;
      }
    }
    if (dto.pauseReason !== undefined) patch.pause_reason = dto.pauseReason ?? null;
    if (dto.assignedUserId !== undefined) patch.assigned_user_id = dto.assignedUserId ?? null;

    await this.knex('prospect_sequence_enrollments').where({ id: enrollmentId }).update(patch);

    return (await this.knex<EnrollmentRow>('prospect_sequence_enrollments')
      .where({ id: enrollmentId })
      .first()) as EnrollmentRow;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXECUTIONS — fila de tarefas
  // ═══════════════════════════════════════════════════════════════════════

  /** Lista executions pendentes da org até a data atual (caixa de entrada do SDR). */
  async listPendingExecutions(user: AuthUserPayload, assignedToMe = false) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRead(role);

    return this.knex('prospect_sequence_step_executions as ex')
      .innerJoin('prospect_sequence_enrollments as en', 'ex.enrollment_id', 'en.id')
      .innerJoin('prospect_sequence_steps as st', 'ex.step_id', 'st.id')
      .innerJoin('prospect_sequences as sq', 'en.sequence_id', 'sq.id')
      .leftJoin('prospect_people as p', 'en.person_id', 'p.id')
      .where('ex.organization_id', organizationId)
      .andWhere('ex.status', 'pending')
      .andWhere('en.status', 'active')
      .modify((q) => {
        if (assignedToMe) q.andWhere('en.assigned_user_id', userId);
      })
      .select(
        'ex.*',
        { step_type: 'st.step_type' },
        { step_subject: 'st.subject' },
        { step_body_template: 'st.body_template' },
        { step_notes: 'st.notes' },
        { step_order: 'st.step_order' },
        { sequence_id: 'sq.id' },
        { sequence_name: 'sq.name' },
        { person_id: 'p.id' },
        { person_name: 'p.name' },
        { person_email: 'p.email' },
        { person_title: 'p.title' },
        { person_company_id: 'p.company_id' },
        { assigned_user_id: 'en.assigned_user_id' },
      )
      .orderBy('ex.scheduled_for', 'asc')
      .limit(200);
  }

  /**
   * Conclui uma execution e agenda a próxima do enrollment.
   * Se não há próximo step, marca enrollment como completed.
   */
  async completeExecution(
    executionId: string,
    dto: CompleteExecutionDto,
    user: AuthUserPayload,
  ): Promise<{ success: boolean; nextScheduledFor: Date | null; enrollmentCompleted: boolean }> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const ex = await trx<ExecutionRow>('prospect_sequence_step_executions')
        .where({ id: executionId, organization_id: organizationId })
        .first();
      if (!ex) throw new NotFoundException('Execução não encontrada');
      if (ex.status !== 'pending') {
        throw new BadRequestException('Execução já finalizada');
      }

      const now = new Date();
      const finalStatus = dto.status ?? 'completed';
      await trx('prospect_sequence_step_executions').where({ id: executionId }).update({
        status: finalStatus,
        executed_at: now,
        executed_by: userId,
        outcome_notes: dto.outcomeNotes ?? null,
      });

      const enrollment = await trx<EnrollmentRow>('prospect_sequence_enrollments')
        .where({ id: ex.enrollment_id })
        .first();
      if (!enrollment) {
        return { success: true, nextScheduledFor: null, enrollmentCompleted: false };
      }

      // Próximo step (step_order > current)
      const nextStep = await trx<StepRow>('prospect_sequence_steps')
        .where({ sequence_id: enrollment.sequence_id })
        .andWhere('step_order', '>', enrollment.current_step_order)
        .orderBy('step_order', 'asc')
        .first();

      if (!nextStep) {
        // Cadência completa
        await trx('prospect_sequence_enrollments').where({ id: enrollment.id }).update({
          status: 'completed',
          current_step_order: enrollment.current_step_order,
          next_action_at: null,
          completed_at: now,
          updated_at: now,
        });
        return { success: true, nextScheduledFor: null, enrollmentCompleted: true };
      }

      const seq = await trx<SequenceRow>('prospect_sequences')
        .where({ id: enrollment.sequence_id })
        .first();
      const settings = seq
        ? ((typeof seq.settings === 'string' ? JSON.parse(seq.settings) : seq.settings) as {
            skip_weekends?: boolean;
          })
        : { skip_weekends: true };
      const scheduled = this.computeScheduledDate(
        now,
        nextStep.wait_days,
        settings.skip_weekends ?? true,
      );

      await trx('prospect_sequence_enrollments').where({ id: enrollment.id }).update({
        current_step_order: nextStep.step_order,
        next_action_at: scheduled,
        updated_at: now,
      });

      await trx('prospect_sequence_step_executions').insert({
        id: randomUUID(),
        organization_id: organizationId,
        enrollment_id: enrollment.id,
        step_id: nextStep.id,
        status: 'pending',
        scheduled_for: scheduled,
        created_at: now,
      });

      return { success: true, nextScheduledFor: scheduled, enrollmentCompleted: false };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Calcula a próxima data de execução adicionando waitDays a fromDate.
   * Se skipWeekends=true, pula sábado/domingo (avança até segunda).
   */
  private computeScheduledDate(fromDate: Date, waitDays: number, skipWeekends: boolean): Date {
    const d = new Date(fromDate.getTime());
    if (waitDays <= 0 && !skipWeekends) return d;

    if (!skipWeekends) {
      d.setDate(d.getDate() + waitDays);
      return d;
    }

    let added = 0;
    while (added < waitDays) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    // Se hoje (waitDays=0) cair em fim-de-semana, empurra pra segunda.
    if (waitDays === 0) {
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1);
      }
    }
    return d;
  }
}

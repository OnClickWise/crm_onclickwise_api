import { Type } from 'class-transformer';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

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

const WRITE_ROLES = ['master', 'admin', 'manager', 'sales', 'accountant'] as const;
const READ_ROLES = [...WRITE_ROLES, 'sdr', 'employee'] as const;

export const SUPPORTED_REFERENCE_TYPES = [
  'sales_document',
  'customer',
  'product',
  'sales_fulfillment',
  'purchase_document',
  'inventory_count',
  'supplier',
] as const;
export type AttachmentReferenceType = (typeof SUPPORTED_REFERENCE_TYPES)[number];

export class CreateAttachmentDto {
  @IsString()
  @MaxLength(40)
  referenceType!: string;

  @IsUUID('4')
  referenceId!: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(1000)
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export interface AttachmentRow {
  id: string;
  organization_id: string;
  reference_type: string;
  reference_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  file_size: number | null;
  category: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: Date;
}

/**
 * Anexos universais — qualquer entidade pode ter arquivos vinculados.
 * Validação: o registro só é criado se reference_type for um dos suportados
 * e (reference_type, reference_id) existir na org.
 *
 * O upload em si do arquivo é responsabilidade do módulo `uploads` (já existe).
 * Aqui apenas registramos a relação + metadata.
 */
@Injectable()
export class AttachmentsService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para anexar arquivos');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para listar anexos');
  }

  private async assertReferenceExists(
    referenceType: string,
    referenceId: string,
    organizationId: string,
  ): Promise<void> {
    if (!SUPPORTED_REFERENCE_TYPES.includes(referenceType as AttachmentReferenceType)) {
      throw new ForbiddenException(`Tipo de referência não suportado: ${referenceType}`);
    }
    const tableMap: Record<string, string> = {
      sales_document: 'sales_documents',
      customer: 'customers',
      product: 'sales_products',
      sales_fulfillment: 'sales_fulfillments',
      purchase_document: 'purchase_documents',
      inventory_count: 'stock_inventory_counts',
      supplier: 'suppliers',
    };
    const table = tableMap[referenceType];
    if (!table) throw new ForbiddenException('Tipo de referência sem tabela mapeada');

    const exists = await this.knex(table)
      .where({ id: referenceId, organization_id: organizationId })
      .first();
    if (!exists) throw new NotFoundException('Entidade referenciada não encontrada nesta org');
  }

  async list(
    referenceType: string,
    referenceId: string,
    user: AuthUserPayload,
  ): Promise<Array<AttachmentRow & { uploader_name?: string | null }>> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    return this.knex('entity_attachments as a')
      .leftJoin('users as u', 'a.uploaded_by', 'u.id')
      .where({
        'a.organization_id': organizationId,
        'a.reference_type': referenceType,
        'a.reference_id': referenceId,
      })
      .select('a.*', { uploader_name: 'u.name' })
      .orderBy('a.created_at', 'desc');
  }

  async create(dto: CreateAttachmentDto, user: AuthUserPayload): Promise<AttachmentRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);
    await this.assertReferenceExists(dto.referenceType, dto.referenceId, organizationId);

    const id = randomUUID();
    await this.knex('entity_attachments').insert({
      id,
      organization_id: organizationId,
      reference_type: dto.referenceType,
      reference_id: dto.referenceId,
      file_name: dto.fileName,
      file_url: dto.fileUrl,
      mime_type: dto.mimeType ?? null,
      file_size: dto.fileSize ?? null,
      category: dto.category ?? null,
      description: dto.description ?? null,
      uploaded_by: userId,
      created_at: new Date(),
    });
    return (await this.knex<AttachmentRow>('entity_attachments')
      .where({ id })
      .first()) as AttachmentRow;
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const deleted = await this.knex('entity_attachments')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Anexo não encontrado');
    return { success: true };
  }
}

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import PDFDocument from 'pdfkit';
import { BrandingService, BrandingRow } from '../branding/branding.service';

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

const READ_ROLES = [
  'master',
  'admin',
  'sales',
  'manager',
  'accountant',
  'sdr',
  'employee',
] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  quote: 'ORÇAMENTO',
  order: 'ENCOMENDA',
  delivery: 'GUIA DE REMESSA',
  invoice: 'FATURA',
  credit_note: 'NOTA DE CRÉDITO',
  customer_return: 'DEVOLUÇÃO DE CLIENTE',
};

/**
 * Gera PDF profissional de documentos de venda usando pdfkit (pure Node,
 * sem browser headless). Layout responde ao branding da org:
 *
 *  - Topo:    logo + nome legal + endereço/contatos da empresa
 *  - Header:  TIPO + número + data + status (+ ATCUD se houver)
 *  - Cliente: razão social + NIF + endereço
 *  - Linhas:  tabela com descrição/qty/preço/desc/iva/total
 *  - Totais:  subtotal, desconto, impostos, total
 *  - Rodapé:  texto livre da branding + condições + agradecimento
 *
 * Retorna Buffer do PDF para o controller transmitir como download ou
 * attach em email.
 */
@Injectable()
export class SalesDocumentPdfService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly brandingService: BrandingService,
  ) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerar PDF');
  }

  /** Gera PDF como Buffer. Caller decide se faz download ou attach email. */
  async generate(documentId: string, user: AuthUserPayload): Promise<{ buffer: Buffer; fileName: string }> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const doc = await this.knex('sales_documents')
      .where({ id: documentId, organization_id: organizationId })
      .first();
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const lines = await this.knex('sales_document_lines')
      .where({ document_id: documentId })
      .orderBy('line_order', 'asc');

    const customer = await this.knex('customers')
      .where({ id: doc.customer_id, organization_id: organizationId })
      .first();

    const branding = await this.brandingService.getForOrg(organizationId);

    const buffer = await this.render(doc, lines, customer, branding);
    const fileName = `${doc.doc_number.replace(/[\/]/g, '_')}.pdf`;
    return { buffer, fileName };
  }

  /**
   * Renderização do PDF — chama pdfkit e captura em buffer.
   * pdfkit é stream-based; coletamos os chunks em um array de Buffer.
   */
  private render(
    doc: Record<string, unknown>,
    lines: Array<Record<string, unknown>>,
    customer: Record<string, unknown> | undefined,
    branding: BrandingRow | null,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const pdf = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `${doc.doc_type} ${doc.doc_number}`,
          Author: (branding?.company_legal_name as string) ?? 'OnClickWise',
        },
      });

      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      try {
        this.drawHeader(pdf, doc, branding);
        this.drawCustomerBlock(pdf, customer ?? {});
        this.drawDocumentMeta(pdf, doc);
        this.drawLinesTable(pdf, lines, String(doc.currency ?? 'BRL'));
        this.drawTotals(pdf, doc);
        this.drawFooter(pdf, doc, branding);
        pdf.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BLOCOS DO LAYOUT
  // ═══════════════════════════════════════════════════════════════════════

  private drawHeader(
    pdf: PDFKit.PDFDocument,
    doc: Record<string, unknown>,
    branding: BrandingRow | null,
  ) {
    const primary = branding?.primary_color ?? '#2563eb';
    const startY = pdf.y;

    // Bloco da empresa (esquerda)
    pdf.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16);
    pdf.text(branding?.company_legal_name ?? 'Sua Empresa', 50, startY);
    pdf.font('Helvetica').fontSize(9).fillColor('#475569');
    if (branding?.company_tax_id) {
      pdf.text(
        `${(branding.company_tax_id_type ?? '').toUpperCase()}: ${branding.company_tax_id}`,
        50,
        pdf.y + 2,
      );
    }
    if (branding?.company_address) pdf.text(branding.company_address, 50, pdf.y + 2);
    const cityLine = [branding?.company_city, branding?.company_country]
      .filter(Boolean)
      .join(' · ');
    if (cityLine) pdf.text(cityLine, 50, pdf.y + 2);
    const contactLine = [branding?.company_phone, branding?.company_email]
      .filter(Boolean)
      .join(' · ');
    if (contactLine) pdf.text(contactLine, 50, pdf.y + 2);

    // Bloco do tipo de documento (direita)
    const docLabel = DOC_TYPE_LABELS[String(doc.doc_type)] ?? String(doc.doc_type).toUpperCase();
    pdf.fillColor(primary).font('Helvetica-Bold').fontSize(22);
    pdf.text(docLabel, 350, startY, { width: 200, align: 'right' });
    pdf.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a');
    pdf.text(String(doc.doc_number), 350, pdf.y + 4, { width: 200, align: 'right' });

    pdf.font('Helvetica').fontSize(9).fillColor('#475569');
    const issueDate = doc.issue_date
      ? new Date(doc.issue_date as string).toLocaleDateString('pt-BR')
      : '—';
    pdf.text(`Emissão: ${issueDate}`, 350, pdf.y + 6, { width: 200, align: 'right' });
    if (doc.due_date) {
      pdf.text(
        `Vencimento: ${new Date(doc.due_date as string).toLocaleDateString('pt-BR')}`,
        350,
        pdf.y + 2,
        { width: 200, align: 'right' },
      );
    }

    // Separador
    pdf.moveDown(2);
    const sepY = pdf.y + 8;
    pdf.strokeColor(primary).lineWidth(2).moveTo(50, sepY).lineTo(545, sepY).stroke();
    pdf.moveDown(1.5);
  }

  private drawCustomerBlock(pdf: PDFKit.PDFDocument, customer: Record<string, unknown>) {
    const startY = pdf.y;
    pdf.fillColor('#64748b').font('Helvetica-Bold').fontSize(8);
    pdf.text('CLIENTE', 50, startY);
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
    pdf.text(String(customer.name ?? '—'), 50, pdf.y + 2);

    pdf.font('Helvetica').fontSize(9).fillColor('#475569');
    if (customer.tax_id) {
      const label = customer.tax_id_type
        ? `${String(customer.tax_id_type).toUpperCase()}: `
        : '';
      pdf.text(`${label}${String(customer.tax_id)}`, 50, pdf.y + 2);
    }
    if (customer.address) pdf.text(String(customer.address), 50, pdf.y + 2);
    if (customer.email) pdf.text(String(customer.email), 50, pdf.y + 2);
    pdf.moveDown(1.5);
  }

  private drawDocumentMeta(pdf: PDFKit.PDFDocument, doc: Record<string, unknown>) {
    if (!doc.payment_method && !doc.valid_until) return;
    const startY = pdf.y;
    pdf.fillColor('#64748b').font('Helvetica').fontSize(9);
    const parts: string[] = [];
    if (doc.payment_method) parts.push(`Pagamento: ${String(doc.payment_method)}`);
    if (doc.valid_until) {
      parts.push(
        `Válido até: ${new Date(doc.valid_until as string).toLocaleDateString('pt-BR')}`,
      );
    }
    pdf.text(parts.join('  ·  '), 50, startY);
    pdf.moveDown(0.5);
  }

  private drawLinesTable(
    pdf: PDFKit.PDFDocument,
    lines: Array<Record<string, unknown>>,
    currency: string,
  ) {
    const tableTop = pdf.y + 10;
    const colX = {
      idx: 50,
      desc: 75,
      qty: 320,
      price: 365,
      disc: 425,
      tax: 465,
      total: 505,
    };

    // Cabeçalho
    pdf.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9);
    pdf.rect(50, tableTop - 4, 495, 18).fillColor('#f1f5f9').fill();
    pdf.fillColor('#0f172a');
    pdf.text('#', colX.idx, tableTop);
    pdf.text('Descrição', colX.desc, tableTop);
    pdf.text('Qtd', colX.qty, tableTop, { width: 40, align: 'right' });
    pdf.text('Preço', colX.price, tableTop, { width: 55, align: 'right' });
    pdf.text('Desc%', colX.disc, tableTop, { width: 35, align: 'right' });
    pdf.text('IVA%', colX.tax, tableTop, { width: 35, align: 'right' });
    pdf.text('Total', colX.total, tableTop, { width: 50, align: 'right' });

    let y = tableTop + 20;
    pdf.font('Helvetica').fontSize(9).fillColor('#0f172a');

    for (const line of lines) {
      // Quebra de página
      if (y > 720) {
        pdf.addPage();
        y = 60;
      }
      const rowStart = y;
      pdf.text(String(line.line_order), colX.idx, y);
      const descText = String(line.description);
      const codeText = line.product_code ? `\n${String(line.product_code)}` : '';
      pdf.text(descText + codeText, colX.desc, y, { width: 235 });
      const descHeight = pdf.heightOfString(descText + codeText, { width: 235 });

      pdf.text(this.fmtNum(line.quantity), colX.qty, rowStart, { width: 40, align: 'right' });
      pdf.text(this.fmtMoney(line.unit_price, currency), colX.price, rowStart, {
        width: 55,
        align: 'right',
      });
      pdf.text(`${this.fmtNum(line.discount_pct)}%`, colX.disc, rowStart, {
        width: 35,
        align: 'right',
      });
      pdf.text(`${this.fmtNum(line.tax_rate_pct)}%`, colX.tax, rowStart, {
        width: 35,
        align: 'right',
      });
      pdf.font('Helvetica-Bold');
      pdf.text(this.fmtMoney(line.line_total, currency), colX.total, rowStart, {
        width: 50,
        align: 'right',
      });
      pdf.font('Helvetica');

      y = rowStart + Math.max(descHeight, 12) + 8;
      pdf.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, y - 4).lineTo(545, y - 4).stroke();
    }

    pdf.y = y + 4;
  }

  private drawTotals(pdf: PDFKit.PDFDocument, doc: Record<string, unknown>) {
    const currency = String(doc.currency ?? 'BRL');
    const startY = pdf.y + 8;
    const labelX = 350;
    const valueX = 460;

    pdf.font('Helvetica').fontSize(9).fillColor('#475569');
    pdf.text('Subtotal', labelX, startY, { width: 100, align: 'right' });
    pdf.fillColor('#0f172a').text(this.fmtMoney(doc.subtotal, currency), valueX, startY, {
      width: 85,
      align: 'right',
    });

    pdf.fillColor('#475569').text('Desconto', labelX, pdf.y + 2, { width: 100, align: 'right' });
    pdf
      .fillColor('#dc2626')
      .text(`− ${this.fmtMoney(doc.total_discount, currency)}`, valueX, pdf.y - 11, {
        width: 85,
        align: 'right',
      });

    pdf.fillColor('#475569').text('Impostos', labelX, pdf.y + 4, { width: 100, align: 'right' });
    pdf.fillColor('#0f172a').text(this.fmtMoney(doc.total_tax, currency), valueX, pdf.y - 11, {
      width: 85,
      align: 'right',
    });

    // Linha do total
    pdf.strokeColor('#cbd5e1').lineWidth(1).moveTo(350, pdf.y + 6).lineTo(545, pdf.y + 6).stroke();

    pdf.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
    pdf.text('TOTAL', labelX, pdf.y + 12, { width: 100, align: 'right' });
    pdf.text(this.fmtMoney(doc.total, currency), valueX, pdf.y - 14, {
      width: 85,
      align: 'right',
    });

    if (Number(doc.amount_paid ?? 0) > 0) {
      pdf.font('Helvetica').fontSize(9).fillColor('#059669');
      pdf.text('Pago', labelX, pdf.y + 10, { width: 100, align: 'right' });
      pdf.text(this.fmtMoney(doc.amount_paid, currency), valueX, pdf.y - 11, {
        width: 85,
        align: 'right',
      });
      const outstanding = Number(doc.total) - Number(doc.amount_paid);
      if (outstanding > 0) {
        pdf.fillColor('#d97706').font('Helvetica-Bold');
        pdf.text('Em aberto', labelX, pdf.y + 2, { width: 100, align: 'right' });
        pdf.text(this.fmtMoney(outstanding, currency), valueX, pdf.y - 11, {
          width: 85,
          align: 'right',
        });
      }
    }
  }

  private drawFooter(
    pdf: PDFKit.PDFDocument,
    doc: Record<string, unknown>,
    branding: BrandingRow | null,
  ) {
    // Notas + termos do doc, e rodapé fixo da branding
    if (doc.notes || doc.terms) {
      pdf.moveDown(3);
      pdf.font('Helvetica-Bold').fontSize(8).fillColor('#64748b');
      if (doc.notes) {
        pdf.text('OBSERVAÇÕES', 50, pdf.y);
        pdf.font('Helvetica').fontSize(9).fillColor('#475569');
        pdf.text(String(doc.notes), 50, pdf.y + 2, { width: 495 });
      }
      if (doc.terms) {
        pdf.moveDown(0.5);
        pdf.font('Helvetica-Bold').fontSize(8).fillColor('#64748b');
        pdf.text('TERMOS E CONDIÇÕES', 50, pdf.y);
        pdf.font('Helvetica').fontSize(9).fillColor('#475569');
        pdf.text(String(doc.terms), 50, pdf.y + 2, { width: 495 });
      }
    }

    // Rodapé na base da página
    if (branding?.document_footer) {
      const pageHeight = pdf.page.height;
      pdf
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(branding.document_footer, 50, pageHeight - 80, {
          width: 495,
          align: 'center',
        });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private fmtMoney(value: unknown, currency: string): string {
    const n = Number(value ?? 0);
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  }

  private fmtNum(value: unknown): string {
    const n = Number(value ?? 0);
    // Remove trailing zeros desnecessários (12.0000 → 12; 12.5000 → 12.5)
    return n.toFixed(4).replace(/\.?0+$/, '');
  }
}

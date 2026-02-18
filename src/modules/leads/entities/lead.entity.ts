export class LeadEntity {
  id: string;
  organizationId: string;
  assignedUserId?: string | null;

  // Dados Pessoais
  name: string;
  email: string;
  phone?: string;
  ssn?: string; // CPF
  ein?: string; // CNPJ

  // Controle
  source?: string;
  status: string;
  pipelineId?: string;
  stageId?: string;

  // Comercial
  value?: number;
  description?: string;
  estimated_close_date?: Date;

  // Metadados
  createdAt: Date;
  updatedAt: Date;

  // O construtor garante que a entidade nasça válida ou com defaults
  constructor(props: Partial<LeadEntity>, id?: string,assignedUserId?:string) {
    this.id = id || props.id!;
    this.organizationId = props.organizationId!;
    this.assignedUserId = assignedUserId || props.assignedUserId || null;
    
    this.name = props.name!;
    this.email = props.email!;
    this.phone = props.phone;
    this.ssn = props.ssn;
    this.ein = props.ein;
    
    this.source = props.source;
    
    this.status = props.status || 'New';
    
    this.pipelineId = props.pipelineId;
    this.stageId = props.stageId;
    
    this.value = props.value ? Number(props.value) : undefined;
    this.description = props.description;
    this.estimated_close_date = props.estimated_close_date ? new Date(props.estimated_close_date) : undefined;
    
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  // --- MÉTODOS DE DOMÍNIO  ---

  /**
   * Verifica se o lead tem dados suficientes para avançar no pipeline
   * (Ex: Só avança se tiver documento ou telefone)
   */


  public isQualifiable(): boolean {
    const hasContact = !!this.phone || !!this.email;
    const hasDocument = !!this.ssn || !!this.ein;
    return hasContact && hasDocument;
  }


  public getMaskedDocument(): string | null {
    if (this.ssn) return `***.***.${this.ssn.slice(-2)}`;
    if (this.ein) return `**.***.***/****-${this.ein.slice(-2)}`;
    return null;
  }


  public isHighTicket(): boolean {
    return (this.value || 0) > 10000; // Exemplo: acima de 10k é High Ticket
  }

  /**
   * Define se o lead está "frio" (criado há mais de 30 dias e ainda status 'New')
   */

  
  public isStale(): boolean {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const isOld = (new Date().getTime() - this.createdAt.getTime()) > thirtyDaysInMs;
    return this.status === 'New' && isOld;
  }

  /**
   * Atualiza o timestamp automaticamente ao mudar dados
   */
  public touch(): void {
    this.updatedAt = new Date();
  }
}
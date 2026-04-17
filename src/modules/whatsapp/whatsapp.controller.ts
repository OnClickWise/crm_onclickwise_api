// src/modules/whatsapp/controllers/whatsapp.controller.ts
import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Patch, 
  Body, 
  Req, 
  UseGuards, 
  HttpCode, 
  HttpStatus, 
  Header, 
  Query, 
  Param, 
  ParseIntPipe,
  UnauthorizedException
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { LinkWhatsappAccountDto } from '@/modules/whatsapp/dtos/link-whatsapp.dto';
import { ConnectEvolutionDto } from '@/modules/whatsapp/dtos/connect-evolution.dto';
import { SendWhatsappMessageDto } from '@/modules/whatsapp/dtos/send-message-dto';
import { TwilioWebhookDto } from '@/modules/whatsapp/dtos/receive-whatsapp-message.dto';
import { SaveWhatsappContactDto } from '@/modules/whatsapp/dtos/save-contact.dto';

import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import { ChatGateway } from '../chat/chat.gateway';


// Injeção de todos os Use Cases
import { ConnectEvolutionUseCase } from 'src/use-cases/whatsapp/connect-evolution.useCase'; // Use Case novo
import { LinkWhatsappAccountUseCase } from 'src/use-cases/whatsapp/link-whatsapp-account.useCase';
import { SendWhatsappMessageUseCase } from 'src/use-cases/whatsapp/send-whatsapp-message.useCase';
import { ReceiveWhatsappWebhookUseCase } from 'src/use-cases/whatsapp/receive-whatsapp-webhook.useCase';
import { GetConversationsUseCase } from 'src/use-cases/whatsapp/list-whatsapp-conversations.useCase';
import { GetMessagesUseCase } from 'src/use-cases/whatsapp/get-messages-from-conversation.useCase';
import { MarkAsReadUseCase } from 'src/use-cases/whatsapp/mark-read.useCase';
import { DisconnectWhatsappUseCase } from 'src/use-cases/whatsapp/remove-whatsapp-account.useCase';
import { UpdateMessageStatusUseCase } from 'src/use-cases/whatsapp/update-message-status.useCase';
import { SaveWhatsappContactUseCase } from 'src/use-cases/whatsapp/save-whatsapp-contact.useCase';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappRepo: WhatsappRepository,
    private readonly chatGateway: ChatGateway,
    private readonly connectEvolutionUC: ConnectEvolutionUseCase, // Adicionado
    private readonly linkAccountUC: LinkWhatsappAccountUseCase,
    private readonly sendMessageUC: SendWhatsappMessageUseCase,
    private readonly receiveWebhookUC: ReceiveWhatsappWebhookUseCase,
    private readonly getConversationsUC: GetConversationsUseCase,
    private readonly getMessagesUC: GetMessagesUseCase,
    private readonly markAsReadUC: MarkAsReadUseCase,
    private readonly disconnectUC: DisconnectWhatsappUseCase,
    private readonly updateStatusUC: UpdateMessageStatusUseCase,
    private readonly saveContactUC: SaveWhatsappContactUseCase,
  ) {}

  // -------------------------------------------------------------------------
  // GESTÃO DA CONTA (Nível de Organização)
  // -------------------------------------------------------------------------

  /**
   * Vincula ou atualiza as credenciais da Twilio para a organização logada.
   */
@UseGuards(JwtAuthGuard)
@Post('account')
@HttpCode(HttpStatus.OK)
async link(@Req() req: any) {
  // Extraímos o ID e o Nome da organização diretamente do token JWT
  const organizationId = req.user.organization_id;
  const organizationName = req.user.organization_name; // Ou outro campo do seu JWT

  // O UseCase agora cuida de criar a subconta na Twilio e salvar no banco
  return this.linkAccountUC.execute(organizationId, organizationName);
}

// -------------------------------------------------------------------------
  // GESTÃO DA CONTA (Evolution API)
  // -------------------------------------------------------------------------

  /**
   * Solicita a criação de uma instância na Evolution API e retorna o QR Code.
   */
  

  /**
   * Remove a integração de WhatsApp da organização.
   */
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Req() req: any) {
    const organizationId = req.user.organization_id;
    return this.disconnectUC.execute(organizationId);
  }


  /**
   * Lista todas as conversas ativas da organização (Barra lateral do chat).
   */
  @UseGuards(JwtAuthGuard)
  @Get('conversations')
async listConversations(@Req() req: any) {
  // Tenta pegar de todas as formas possíveis que seu sistema já usou
  const organizationId = req.user?.organizationId || req.user?.organization_id || req.user?.org;

  if (!organizationId) {
    throw new UnauthorizedException('Organization ID not found in token');
  }

  return this.getConversationsUC.execute(organizationId, { limit: 20, offset: 0 });
}

@UseGuards(JwtAuthGuard)
  @Post('contacts')
  @HttpCode(HttpStatus.OK)
  async saveContact(@Body() dto: SaveWhatsappContactDto, @Req() req: any) {
    const organizationId = req.user.organizationId || req.user.organization_id;

    return await this.saveContactUC.execute({
      organization_id: organizationId,
      wa_id: dto.wa_id,
      display_name: dto.display_name,
    });
  }

  /**
   * Obtém o histórico de mensagens de uma conversa específica.
   */
  @UseGuards(JwtAuthGuard)
@Get('conversations/:id/messages')
async getMessages(
  @Param('id') conversationId: string,
  @Query() query: any,
  @Req() req: any
) {
  // DEBUG: Abra o terminal do VS Code e veja o que aparece aqui!
  console.log('--- DEBUG JWT USER ---');
  console.log(req.user); 
  
  // Tente capturar de todas as formas possíveis que o seu JWT costuma usar
  const organizationId = req.user?.organization_id || req.user?.orgId || req.user?.organizationId;

  if (!organizationId) {
    console.error('ERRO: organization_id não encontrado no req.user. Verifique o JwtStrategy.');
  }

  return this.getMessagesUC.execute(organizationId, conversationId, query);
}

@UseGuards(JwtAuthGuard)
@Post('evolution/connect')
async connect(@Body() dto: ConnectEvolutionDto, @Req() req: any) {
  const organizationId = req.user.organizationId;

  return await this.connectEvolutionUC.execute(
    organizationId,
    dto // Passamos o objeto inteiro agora
  );
}

@UseGuards(JwtAuthGuard)
  @Get('accounts')
  async getAccount(@Req() req: any) {
    // Usamos o padrão de ID que você já utiliza nas outras rotas (listConversations, etc)
    const organizationId = req.user.organizationId || req.user.organization_id;

    if (!organizationId) {
      throw new UnauthorizedException('ID da organização não encontrado no token');
    }

    // Chamamos o método do repositório que você acabou de atualizar
    const account = await this.whatsappRepo.getEvolutionAccountByOrganizationId(organizationId);

    // Se não houver conta, retornamos null para o frontend exibir o formulário de criação
    if (!account) {
      return { data: null };
    }

    // Retornamos a conta encontrada. No F5, o frontend lerá o status: 'open' aqui.
    return { data: account };
  }


  /**
   * Envia uma nova mensagem via Twilio.
   */
  @UseGuards(JwtAuthGuard)
  @Post('messages/send')
  async sendMessage(
    @Req() req: any, // Voltamos para o padrão que você já usa
    @Body() dto: SendWhatsappMessageDto
  ) {
    // Pegamos o ID da organização do request, igual você faz nas outras rotas
    // Note: Verifique se no seu JWT o campo é organizationId ou organization_id
    const organizationId = req.user.organizationId || req.user.organization_id; 

    return await this.sendMessageUC.execute(
      organizationId, 
      dto
    );
  }

  /**
   * Marca todas as mensagens de uma conversa como lidas.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') conversationId: string, @Req() req: any) {
  // VEJA O QUE APARECE AQUI NO TERMINAL
  console.log('CONTEÚDO DO USER NO JWT:', req.user);

  // Tente encontrar o ID da org. Pode ser 'orgId', 'organizationId', 'organization_id', etc.
  const organizationId = req.user.organizationId || req.user.organization_id || req.user.orgId;

  if (!organizationId) {
    throw new Error('Não foi possível encontrar o organization_id no req.user');
  }

  return this.markAsReadUC.execute(conversationId, organizationId);
}

  // -------------------------------------------------------------------------
  // WEBHOOKS (Endpoints Públicos chamados pela Twilio)
  // -------------------------------------------------------------------------

  /**
   * Webhook para mensagens recebidas (Inbound).
   * Deve ser configurado na Twilio em: "A message comes in".
   */
  @Post('webhook/incoming')
  @Header('Content-Type', 'text/xml')
  async incoming(@Body() dto: TwilioWebhookDto) {
    await this.receiveWebhookUC.execute(dto);
    // Retorna TwiML vazio para confirmar receção sem erro à Twilio
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  /**
   * Webhook para atualizações de status (Sent, Delivered, Read).
   * Deve ser configurado na Twilio em: "Status Callback URL".
   */
  @Post('webhook/status')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/xml')
  async status(@Body() dto: any) {
    await this.updateStatusUC.execute(dto);
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  // -------------------------------------------------------------------------
  // WEBHOOKS (Específico para Evolution)
  // -------------------------------------------------------------------------

  /**
   * Webhook para mensagens recebidas via Evolution API.
   */
  @Post('webhook/evolution')
@HttpCode(HttpStatus.OK)
async evolutionWebhook(@Body() body: any) {
  console.log('--- PAYLOAD RECEBIDO ---');
  console.log(JSON.stringify(body, null, 2));
  const { event, instance, data } = body;

  // 1. Tratamento de Estados da Conexão
  if (event === 'connection.update') {
    const state = data?.state;
    
    // Mapeamos os estados da Evolution para o seu banco
    const statusMap = {
      'open': 'open',
      'connecting': 'connecting',
      'close': 'disconnected',
      'refused': 'disconnected'
    };

    const newStatus = statusMap[state] || 'created';

    console.log(`[Webhook] Instância ${instance} mudou para: ${state}`);

    // Atualiza o banco e recupera a conta com o organization_id
    const updatedAccount = await this.whatsappRepo.upsertAccount({
      instance_name: instance, // A Evolution envia o nome aqui
      status: newStatus,
      is_authenticated: state === 'open',
      wa_id: data?.number || null 
    });

    if (updatedAccount) {
      // Notifica o Frontend via Socket para mudar o ícone/status em tempo real
      this.chatGateway.emitWhatsappStatusUpdated(
        updatedAccount.organization_id, 
        updatedAccount
      );
    }
    
    return { status: 'connection_updated' };
  }

  // 2. Mensagens, Contatos e Conversas
  // Passamos para o Use Case que já refatoramos com a nova estrutura de tabelas
  if (event === 'messages.upsert') {
    await this.receiveWebhookUC.execute(body);
  }

  // 3. (Opcional) Atualização de Status da Mensagem (Lido/Entregue)
  if (event === 'messages.update') {
     // Aqui você poderia atualizar o check azul (is_read) no futuro
  }

  return { status: 'processed' };
}
}
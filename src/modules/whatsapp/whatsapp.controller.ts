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
  ParseIntPipe 
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { LinkWhatsappAccountDto } from '@/modules/whatsapp/dtos/link-whatsapp.dto';
import { SendWhatsappMessageDto } from '@/modules/whatsapp/dtos/send-message-dto';
import { TwilioWebhookDto } from '@/modules/whatsapp/dtos/receive-whatsapp-message.dto';

// Injeção de todos os Use Cases
import { LinkWhatsappAccountUseCase } from 'src/use-cases/whatsapp/link-whatsapp-account.useCase';
import { SendWhatsappMessageUseCase } from 'src/use-cases/whatsapp/send-whatsapp-message.useCase';
import { ReceiveWhatsappWebhookUseCase } from 'src/use-cases/whatsapp/receive-whatsapp-webhook.useCase';
import { GetConversationsUseCase } from 'src/use-cases/whatsapp/list-whatsapp-conversations.useCase';
import { GetMessagesUseCase } from 'src/use-cases/whatsapp/get-messages-from-conversation.useCase';
import { MarkAsReadUseCase } from 'src/use-cases/whatsapp/mark-read.useCase';
import { DisconnectWhatsappUseCase } from 'src/use-cases/whatsapp/remove-whatsapp-account.useCase';
import { UpdateMessageStatusUseCase } from 'src/use-cases/whatsapp/update-message-status.useCase';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly linkAccountUC: LinkWhatsappAccountUseCase,
    private readonly sendMessageUC: SendWhatsappMessageUseCase,
    private readonly receiveWebhookUC: ReceiveWhatsappWebhookUseCase,
    private readonly getConversationsUC: GetConversationsUseCase,
    private readonly getMessagesUC: GetMessagesUseCase,
    private readonly markAsReadUC: MarkAsReadUseCase,
    private readonly disconnectUC: DisconnectWhatsappUseCase,
    private readonly updateStatusUC: UpdateMessageStatusUseCase,
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
  async listConversations(
    @Req() req: any,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('offset', new ParseIntPipe({ optional: true })) offset: number = 0,
  ) {
    const organizationId = req.user.organization_id;
    return this.getConversationsUC.execute(organizationId, { limit, offset });
  }

  /**
   * Obtém o histórico de mensagens de uma conversa específica.
   */
  @UseGuards(JwtAuthGuard)
  @Get('conversations/:id/messages')
  async listMessages(
    @Param('id') conversationId: string,
    @Req() req: any,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 50,
    @Query('offset', new ParseIntPipe({ optional: true })) offset: number = 0,
  ) {
    const organizationId = req.user.organization_id;
    return this.getMessagesUC.execute(organizationId, conversationId, { limit, offset });
  }

  /**
   * Envia uma nova mensagem via Twilio.
   */
  @UseGuards(JwtAuthGuard)
  @Post('messages/send')
  @HttpCode(HttpStatus.CREATED)
  async send(@Body() dto: SendWhatsappMessageDto, @Req() req: any) {
    const organizationId = req.user.organization_id;
    return this.sendMessageUC.execute(organizationId, dto);
  }

  /**
   * Marca todas as mensagens de uma conversa como lidas.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') conversationId: string, @Req() req: any) {
    const userId = req.user.id;
    return this.markAsReadUC.execute(conversationId, userId);
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
}
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { env } from '@/shared/config/env';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

@Injectable()
export class ChatService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private async enrichMessage(message: any) {
    const sender = await this.knex('users').where({ id: message.sender_user_id }).first('name', 'email');
    return {
      ...message,
      sender_name: sender?.name || null,
      sender_email: sender?.email || null,
    };
  }

  private async createMessage(data: {
    organizationId: string;
    channelId: string;
    senderUserId: string;
    body: string;
    messageType?: 'text' | 'system' | 'audio';
    metadata?: any;
  }) {
    const [message] = await this.knex('chat_messages')
      .insert({
        id: randomUUID(),
        organization_id: data.organizationId,
        channel_id: data.channelId,
        sender_user_id: data.senderUserId,
        body: data.body,
        message_type: data.messageType || 'text',
        metadata: data.metadata || null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    await this.knex('chat_channels')
      .where({ id: data.channelId, organization_id: data.organizationId })
      .update({ last_message_at: new Date(), updated_at: new Date() });

    return this.enrichMessage(message);
  }

  private getScope(user: any): { organizationId: string; userId: string } {
    const organizationId = user?.organizationId;
    const userId = user?.userId;

    if (!organizationId || !userId) {
      throw new ForbiddenException('Usuário sem escopo de organização válido');
    }

    return { organizationId, userId };
  }

  private hasOrganizationWideAccess(user: any): boolean {
    const role = String(user?.role || '').toLowerCase();
    return role === 'admin' || role === 'master';
  }

  private normalizeSlug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private async ensureChannelAccess(channelId: string, user: any): Promise<void> {
    const { organizationId, userId } = this.getScope(user);

    if (this.hasOrganizationWideAccess(user)) {
      const exists = await this.knex('chat_channels')
        .where({ id: channelId, organization_id: organizationId })
        .first();

      if (!exists) {
        throw new NotFoundException('Canal não encontrado');
      }

      return;
    }

    const membership = await this.knex('chat_channel_members as m')
      .join('chat_channels as ch', 'ch.id', 'm.channel_id')
      .where('m.channel_id', channelId)
      .andWhere('m.organization_id', organizationId)
      .andWhere('m.user_id', userId)
      .andWhere('ch.organization_id', organizationId)
      .first('m.id');

    if (!membership) {
      throw new ForbiddenException('Sem acesso a este canal');
    }
  }

  async assertChannelAccess(channelId: string, user: any): Promise<void> {
    await this.ensureChannelAccess(channelId, user);
  }

  private async ensureChannelManagePermission(channelId: string, user: any): Promise<void> {
    if (this.hasOrganizationWideAccess(user)) {
      return;
    }

    const { organizationId, userId } = this.getScope(user);

    const member = await this.knex('chat_channel_members')
      .where({ channel_id: channelId, organization_id: organizationId, user_id: userId })
      .first('role');

    if (!member) {
      throw new ForbiddenException('Sem acesso a este canal');
    }

    if (member.role !== 'owner' && member.role !== 'moderator') {
      throw new ForbiddenException('Permissão insuficiente para gerenciar membros');
    }
  }

  async listChannels(user: any) {
    const { organizationId, userId } = this.getScope(user);

    const baseQuery = this.knex('chat_channels as ch')
      .where('ch.organization_id', organizationId)
      .select(
        'ch.id',
        'ch.organization_id',
        'ch.name',
        'ch.slug',
        'ch.description',
        'ch.is_private',
        'ch.last_message_at',
        'ch.created_at',
        'ch.updated_at',
        this.knex.raw(`(
          select count(*)::int
          from chat_channel_members m
          where m.channel_id = ch.id and m.organization_id = ch.organization_id
        ) as members_count`),
        this.knex.raw(`(
          select msg.body
          from chat_messages msg
          where msg.channel_id = ch.id and msg.organization_id = ch.organization_id
          order by msg.created_at desc
          limit 1
        ) as last_message_preview`),
      )
      .orderByRaw('coalesce(ch.last_message_at, ch.created_at) desc');

    if (!this.hasOrganizationWideAccess(user)) {
      baseQuery.join('chat_channel_members as cm', function () {
        this.on('cm.channel_id', '=', 'ch.id').andOn('cm.organization_id', '=', 'ch.organization_id');
      })
      .andWhere('cm.user_id', userId)
      .andWhere('cm.organization_id', organizationId);
    }

    return await baseQuery;
  }

  async createChannel(data: { name: string; description?: string; isPrivate?: boolean }, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const name = String(data?.name || '').trim();
    if (!name) {
      throw new BadRequestException('Nome do canal é obrigatório');
    }

    const slug = this.normalizeSlug(name);
    if (!slug) {
      throw new BadRequestException('Nome do canal inválido');
    }

    const existing = await this.knex('chat_channels')
      .where({ organization_id: organizationId, slug })
      .first('id');

    if (existing) {
      throw new BadRequestException('Já existe um canal com esse nome');
    }

    const [channel] = await this.knex('chat_channels')
      .insert({
        id: randomUUID(),
        organization_id: organizationId,
        name,
        slug,
        description: data?.description?.trim() || null,
        is_private: Boolean(data?.isPrivate),
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    await this.knex('chat_channel_members').insert({
      id: randomUUID(),
      organization_id: organizationId,
      channel_id: channel.id,
      user_id: userId,
      role: 'owner',
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return channel;
  }

  async addChannelMember(channelId: string, data: { userId: string; role?: 'member' | 'moderator' }, user: any) {
    const { organizationId } = this.getScope(user);

    await this.ensureChannelManagePermission(channelId, user);

    const targetUser = await this.knex('users')
      .where({ id: data.userId, organization_id: organizationId })
      .first('id');

    if (!targetUser) {
      throw new NotFoundException('Usuário não encontrado nesta organização');
    }

    await this.knex('chat_channel_members')
      .insert({
        id: randomUUID(),
        organization_id: organizationId,
        channel_id: channelId,
        user_id: data.userId,
        role: data.role || 'member',
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict(['organization_id', 'channel_id', 'user_id'])
      .ignore();

    return this.listChannelMembers(channelId, user);
  }

  async listChannelMembers(channelId: string, user: any) {
    const { organizationId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    return await this.knex('chat_channel_members as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where('m.organization_id', organizationId)
      .andWhere('m.channel_id', channelId)
      .select(
        'm.id',
        'm.user_id',
        'm.role',
        'm.joined_at',
        'u.name',
        'u.email',
      )
      .orderBy('m.joined_at', 'asc');
  }

  async listMessages(channelId: string, user: any, limit = 50, before?: string) {
    const { organizationId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;

    const query = this.knex('chat_messages as msg')
      .join('users as u', 'u.id', 'msg.sender_user_id')
      .where('msg.organization_id', organizationId)
      .andWhere('msg.channel_id', channelId)
      .select(
        'msg.id',
        'msg.organization_id',
        'msg.channel_id',
        'msg.sender_user_id',
        'msg.body',
        'msg.message_type',
        'msg.metadata',
        'msg.created_at',
        'msg.updated_at',
        'u.name as sender_name',
        'u.email as sender_email',
      )
      .orderBy('msg.created_at', 'desc')
      .limit(safeLimit);

    if (before) {
      query.andWhere('msg.created_at', '<', before);
    }

    const messages = await query;
    return messages.reverse();
  }

  async sendMessage(
    channelId: string,
    data: { body: string; metadata?: any },
    user: any,
    messageType: 'text' | 'audio' = 'text',
  ) {
    const { organizationId, userId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    const body = String(data?.body || '').trim();
    if (!body) {
      throw new BadRequestException('Mensagem não pode ser vazia');
    }

    return this.createMessage({
      organizationId,
      channelId,
      senderUserId: userId,
      body,
      messageType,
      metadata: data.metadata || { kind: messageType },
    });
  }

  /**
   * Envia uma mensagem de áudio (gravação de voz)
   * O arquivo é armazenado em /uploads/chat-messages/ com nome baseado no messageId
   * Suporta formatos wie .m4a, .wav, .mp3, etc
   *
   * @param channelId - ID do canal
   * @param file - Arquivo de áudio do Fastify (MultipartFile)
   * @param user - Usuário autenticado
   * @returns Mensagem criada com URL do áudio
   */
  async sendAudioMessage(channelId: string, file: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    // 1. Validar arquivo
    if (!file) {
      throw new BadRequestException('Arquivo de áudio não enviado');
    }

    const buffer = await file.toBuffer();

    // Limitar a 50MB (áudio pode ser longo)
    const maxSize = 50 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new BadRequestException('Áudio muito grande (máx. 50MB)');
    }

    // Validar que é arquivo de áudio
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!mimeType.startsWith('audio/')) {
      throw new BadRequestException('Arquivo deve ser um áudio válido');
    }

    // 2. Gerar ID único e preparar diretório
    const messageId = randomUUID();
    const originalName = String(file.filename || 'audio.m4a');
    const extension = extname(originalName) || '.m4a';
    const generatedName = `${messageId}${extension}`;

    const dirPath = join(env.UPLOADS_DIR, 'chat-messages');

    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    // 3. Salvar arquivo em disco
    const filePath = join(dirPath, generatedName);
    await writeFile(filePath, buffer);

    // 4. Construir URL pública
    const audioUrl = `/uploads/chat-messages/${generatedName}`;

    // 5. Criar mensagem com tipo 'audio'
    const createdMessage = await this.createMessage({
      organizationId,
      channelId,
      senderUserId: userId,
      body: `🎙️ Mensagem de voz`, // Descrição simples
      messageType: 'audio', // Tipo específico para áudio
      metadata: {
        kind: 'audio',
        audioUrl,
        filename: originalName,
        mimeType: mimeType,
        size: buffer.length,
        duration: null, // Frontend pode calcular depois
      },
    });

    return createdMessage;
  }

  async uploadAttachment(channelId: string, file: any, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureChannelAccess(channelId, user);

    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException('Arquivo muito grande (máx. 20MB)');
    }

    const originalName = String(file.filename || 'arquivo.bin');
    const extension = extname(originalName) || '.bin';
    const generatedName = `${randomUUID()}${extension}`;
    const dirPath = join(env.UPLOADS_DIR, 'chat', organizationId, channelId);

    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const filePath = join(dirPath, generatedName);
    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/chat/${organizationId}/${channelId}/${generatedName}`;
    const isAudio = String(file.mimetype || '').startsWith('audio/');

    return this.createMessage({
      organizationId,
      channelId,
      senderUserId: userId,
      body: isAudio ? `Audio: ${originalName}` : `Anexo: ${originalName}`,
      messageType: 'text',
      metadata: {
        kind: isAudio ? 'audio' : 'attachment',
        fileUrl,
        filename: originalName,
        mimeType: file.mimetype,
        size: buffer.length,
      },
    });
  }

  async reactToMessage(channelId: string, messageId: string, emoji: string, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureChannelAccess(channelId, user);

    const message = await this.knex('chat_messages')
      .where({ id: messageId, channel_id: channelId, organization_id: organizationId })
      .first('*');

    if (!message) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    const metadata = message.metadata || {};
    const currentReactions = metadata.reactions || {};
    const users = Array.isArray(currentReactions[emoji]) ? currentReactions[emoji] : [];

    const hasReacted = users.includes(userId);
    const nextUsers = hasReacted ? users.filter((id: string) => id !== userId) : [...users, userId];

    const nextReactions = {
      ...currentReactions,
      [emoji]: nextUsers,
    };

    if (nextUsers.length === 0) {
      delete nextReactions[emoji];
    }

    const nextMetadata = {
      ...metadata,
      reactions: nextReactions,
    };

    await this.knex('chat_messages')
      .where({ id: messageId })
      .update({ metadata: nextMetadata, updated_at: new Date() });

    return {
      success: true,
      messageId,
      reactions: Object.entries(nextReactions).map(([key, value]) => ({
        emoji: key,
        count: Array.isArray(value) ? value.length : 0,
        reactedByMe: Array.isArray(value) ? value.includes(userId) : false,
      })),
    };
  }

  async createPoll(
    channelId: string,
    data: { question: string; options: string[]; allowMultiple?: boolean; endsAt?: string },
    user: any,
  ) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureChannelAccess(channelId, user);

    const question = String(data.question || '').trim();
    if (!question) {
      throw new BadRequestException('Pergunta da enquete é obrigatória');
    }

    const options = (data.options || [])
      .map((option) => String(option || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    if (options.length < 2) {
      throw new BadRequestException('A enquete precisa de no mínimo 2 opções');
    }

    const pollId = randomUUID();
    const now = new Date();

    await this.knex('chat_polls').insert({
      id: pollId,
      organization_id: organizationId,
      channel_id: channelId,
      created_by: userId,
      question,
      allow_multiple: Boolean(data.allowMultiple),
      ends_at: data.endsAt ? new Date(data.endsAt) : null,
      is_closed: false,
      created_at: now,
      updated_at: now,
    });

    await this.knex('chat_poll_options').insert(
      options.map((label, index) => ({
        id: randomUUID(),
        organization_id: organizationId,
        poll_id: pollId,
        label,
        position: index,
        created_at: now,
        updated_at: now,
      })),
    );

    await this.createMessage({
      organizationId,
      channelId,
      senderUserId: userId,
      body: `Enquete criada: ${question}`,
      messageType: 'system',
      metadata: { kind: 'poll', pollId },
    });

    const polls = await this.listPolls(channelId, user);
    return polls.find((poll: any) => poll.id === pollId);
  }

  async listPolls(channelId: string, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureChannelAccess(channelId, user);

    const polls = await this.knex('chat_polls')
      .where({ organization_id: organizationId, channel_id: channelId })
      .orderBy('created_at', 'desc');

    const pollIds = polls.map((poll) => poll.id);
    if (pollIds.length === 0) {
      return [];
    }

    const options = await this.knex('chat_poll_options')
      .whereIn('poll_id', pollIds)
      .andWhere('organization_id', organizationId)
      .orderBy('position', 'asc');

    const votes = await this.knex('chat_poll_votes')
      .whereIn('poll_id', pollIds)
      .andWhere('organization_id', organizationId)
      .select('poll_id', 'option_id', 'user_id');

    return polls.map((poll) => {
      const pollOptions = options
        .filter((option) => option.poll_id === poll.id)
        .map((option) => {
          const optionVotes = votes.filter((vote) => vote.option_id === option.id);
          return {
            id: option.id,
            label: option.label,
            position: option.position,
            votes: optionVotes.length,
            votedByMe: optionVotes.some((vote) => vote.user_id === userId),
          };
        });

      return {
        ...poll,
        options: pollOptions,
        total_votes: pollOptions.reduce((sum, option) => sum + option.votes, 0),
      };
    });
  }

  async votePoll(channelId: string, pollId: string, optionId: string, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureChannelAccess(channelId, user);

    const poll = await this.knex('chat_polls')
      .where({ id: pollId, channel_id: channelId, organization_id: organizationId })
      .first();

    if (!poll) {
      throw new NotFoundException('Enquete não encontrada');
    }

    if (poll.is_closed) {
      throw new BadRequestException('Esta enquete está encerrada');
    }

    if (poll.ends_at && new Date(poll.ends_at).getTime() < Date.now()) {
      throw new BadRequestException('Prazo da enquete expirado');
    }

    const option = await this.knex('chat_poll_options')
      .where({ id: optionId, poll_id: pollId, organization_id: organizationId })
      .first('id');

    if (!option) {
      throw new BadRequestException('Opção inválida para esta enquete');
    }

    if (!poll.allow_multiple) {
      await this.knex('chat_poll_votes')
        .where({ organization_id: organizationId, poll_id: pollId, user_id: userId })
        .delete();
    }

    await this.knex('chat_poll_votes')
      .insert({
        id: randomUUID(),
        organization_id: organizationId,
        poll_id: pollId,
        option_id: optionId,
        user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict(['organization_id', 'poll_id', 'option_id', 'user_id'])
      .ignore();

    const polls = await this.listPolls(channelId, user);
    return polls.find((item: any) => item.id === pollId);
  }

  async startVideoCall(channelId: string, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureChannelAccess(channelId, user);

    const meetingCode = `onclickwise-${organizationId.slice(0, 8)}-${channelId.slice(0, 8)}-${Date.now()}`;
    const meetingUrl = `https://meet.jit.si/${meetingCode}`;
    const now = new Date();
    const callSessionId = randomUUID();

    await this.knex('chat_call_sessions').insert({
      id: callSessionId,
      organization_id: organizationId,
      channel_id: channelId,
      created_by: userId,
      call_type: 'video',
      provider: 'jitsi',
      meeting_url: meetingUrl,
      status: 'active',
      started_at: now,
      created_at: now,
      updated_at: now,
    });

    await this.createMessage({
      organizationId,
      channelId,
      senderUserId: userId,
      body: 'Iniciou uma chamada de vídeo',
      messageType: 'system',
      metadata: {
        kind: 'video_call',
        callSessionId,
        meetingUrl,
      },
    });

    return {
      success: true,
      callSessionId,
      provider: 'jitsi',
      meetingUrl,
    };
  }

  async markMessageRead(channelId: string, messageId: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    const message = await this.knex('chat_messages')
      .where({ id: messageId, organization_id: organizationId, channel_id: channelId })
      .first('id');

    if (!message) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    await this.knex('chat_channel_members')
      .where({ organization_id: organizationId, channel_id: channelId, user_id: userId })
      .update({ last_read_message_id: messageId, updated_at: new Date() });

    await this.knex('chat_message_reads')
      .insert({
        id: randomUUID(),
        organization_id: organizationId,
        message_id: messageId,
        user_id: userId,
        read_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict(['organization_id', 'message_id', 'user_id'])
      .merge({ read_at: new Date(), updated_at: new Date() });

    return { success: true };
  }

  async deleteChannel(channelId: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const channel = await this.knex('chat_channels')
      .where({ id: channelId, organization_id: organizationId })
      .first('id', 'created_by');

    if (!channel) {
      throw new NotFoundException('Canal não encontrado');
    }

    const isOwner = channel.created_by === userId;
    const isAdmin = this.hasOrganizationWideAccess(user);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Você não tem permissão para deletar este canal');
    }

    // Delete in cascade: messages, polls, votes, reactions, members, reads
    await this.knex('chat_message_reads')
      .where('message_id', 'in', this.knex('chat_messages').select('id').where({ channel_id: channelId }))
      .del();

    await this.knex('chat_poll_votes')
      .where('poll_id', 'in', this.knex('chat_polls').select('id').where({ channel_id: channelId }))
      .del();

    await this.knex('chat_poll_options')
      .where('poll_id', 'in', this.knex('chat_polls').select('id').where({ channel_id: channelId }))
      .del();

    await this.knex('chat_polls')
      .where({ channel_id: channelId, organization_id: organizationId })
      .del();

    await this.knex('chat_messages')
      .where({ channel_id: channelId, organization_id: organizationId })
      .del();

    await this.knex('chat_channel_members')
      .where({ channel_id: channelId, organization_id: organizationId })
      .del();

    await this.knex('chat_channels')
      .where({ id: channelId, organization_id: organizationId })
      .del();

    return { success: true, channelId };
  }

  async updateMessage(channelId: string, messageId: string, data: { body: string; metadata?: any }, user: any) {
    const { organizationId, userId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    const message = await this.knex('chat_messages')
      .where({ id: messageId, organization_id: organizationId, channel_id: channelId })
      .first('id', 'sender_user_id', 'metadata');

    if (!message) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    if (message.sender_user_id !== userId && !this.hasOrganizationWideAccess(user)) {
      throw new ForbiddenException('Você só pode editar suas próprias mensagens');
    }

    const body = String(data.body || '').trim();
    if (!body) {
      throw new BadRequestException('Corpo da mensagem é obrigatório');
    }

    const updatedMetadata = {
      ...message.metadata,
      ...(data.metadata || {}),
      edited_at: new Date().toISOString(),
    };

    const [updated] = await this.knex('chat_messages')
      .where({ id: messageId })
      .update({
        body,
        metadata: updatedMetadata,
        updated_at: new Date(),
      })
      .returning('*');

    return this.enrichMessage(updated);
  }

  async deleteMessage(channelId: string, messageId: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    await this.ensureChannelAccess(channelId, user);

    const message = await this.knex('chat_messages')
      .where({ id: messageId, organization_id: organizationId, channel_id: channelId })
      .first('id', 'sender_user_id');

    if (!message) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    if (message.sender_user_id !== userId && !this.hasOrganizationWideAccess(user)) {
      throw new ForbiddenException('Você só pode deletar suas próprias mensagens');
    }

    // Delete related data first
    await this.knex('chat_message_reads')
      .where({ message_id: messageId, organization_id: organizationId })
      .del();

    // Delete the message
    await this.knex('chat_messages')
      .where({ id: messageId, organization_id: organizationId })
      .del();

    return { success: true, messageId };
  }

  async listAttachments(channelId: string, type?: 'attachment' | 'video' | 'audio', user?: any) {
    const { organizationId } = user ? this.getScope(user) : { organizationId: '' };

    if (user) {
      await this.ensureChannelAccess(channelId, user);
    }

    const query = this.knex('chat_messages as msg')
      .join('users as u', 'u.id', 'msg.sender_user_id')
      .where('msg.organization_id', organizationId)
      .andWhere('msg.channel_id', channelId)
      .andWhereRaw(`msg.metadata->>'kind' IN (?, ?, ?)`, ['attachment', 'video', 'audio'])
      .select(
        'msg.id',
        'msg.body',
        'msg.sender_user_id',
        'msg.metadata',
        'msg.created_at',
        'u.name as sender_name',
        'u.email as sender_email',
      )
      .orderBy('msg.created_at', 'desc');

    if (type) {
      query.andWhereRaw(`msg.metadata->>'kind' = ?`, [type]);
    }

    const messages = await query;

    return messages.map((msg) => ({
      id: msg.id,
      messageId: msg.id,
      type: msg.metadata?.kind || 'attachment',
      filename: msg.metadata?.filename || msg.body,
      fileUrl: msg.metadata?.fileUrl,
      senderName: msg.sender_name,
      senderEmail: msg.sender_email,
      createdAt: msg.created_at,
      metadata: msg.metadata,
    }));
  }
}

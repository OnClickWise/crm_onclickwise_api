// src/modules/whatsapp/interfaces/whatsapp.interfaces.ts

export interface WhatsappAccount {
  id: string;
  organization_id: string;
  twilio_account_name?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  instance_name?: string;
  is_authenticated?: boolean;
  authenticated_at?: Date | null;
  expires_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface WhatsappConversation {
  id: string;
  account_id?: string | null;
  organization_id: string;
  whatsapp_username: string; // Geralmente o número do lead (ex: whatsapp:+5511999999999)
  lead_id?: string | null;
  chat_type?: 'private' | 'group';
  is_active?: boolean;
  last_message_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
  contact_name?: string | null;
}

export interface WhatsappMessage {
  id: string;
  whatsapp_conversation_id: string;
  whatsapp_message_id: string; // MessageSid da Twilio
  direction: 'incoming' | 'outgoing';
  message_text?: string | null;
  message_type?: 'text' | 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'location' | 'contact' | 'poll';
  caption?: string | null;
  message_metadata?: any; // JSON
  whatsapp_date?: Date | null;
  is_read?: boolean;
  is_delivered?: boolean;
  is_from_account?: boolean;
  attachment_file_data?: Buffer | null;
  read_by_users?: any; // JSONB Array
  created_at?: Date;
}
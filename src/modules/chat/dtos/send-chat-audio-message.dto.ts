/**
 * DTO para envio de mensagem de áudio no chat
 * Frontend envia um arquivo multipart/form-data com a gravação
 */
export class SendChatAudioMessageDto {
  // O arquivo será recebido via req.file() no controller
  // Este arquivo é um blob de áudio convertido em buffer (ex: .wav, .m4a)
  file?: any;
}

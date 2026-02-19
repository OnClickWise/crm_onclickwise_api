import { IsOptional } from 'class-validator';

export class UploadAttachmentDto {
  @IsOptional() // O arquivo será validado pelo Interceptor, não pelo Pipe
  file?: any;
}
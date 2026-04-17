import { IsNotEmpty, IsString } from 'class-validator';

export class SaveWhatsappContactDto {
  @IsString()
  @IsNotEmpty()
  wa_id: string;

  @IsString()
  @IsNotEmpty()
  display_name: string;
}
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor deve estar em formato hex (#RRGGBB)' })
  color?: string;

  @IsOptional()
  @IsIn(['prospects', 'icp', 'campaign', 'archive'])
  listType?: 'prospects' | 'icp' | 'campaign' | 'archive';
}

export class UpdateListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsIn(['prospects', 'icp', 'campaign', 'archive'])
  listType?: 'prospects' | 'icp' | 'campaign' | 'archive';

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ListItemDto {
  @IsIn(['person', 'company'])
  itemType!: 'person' | 'company';

  @IsUUID('4')
  itemId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AddItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ListItemDto)
  items!: ListItemDto[];
}

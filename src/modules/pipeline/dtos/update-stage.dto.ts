import { IsOptional, IsString } from 'class-validator';
import type { PipelineStageType } from '../entities/pipeline_stage-type';



export class UpdateStageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  stage_type?: PipelineStageType;

  @IsOptional()
  order?: number;

  @IsOptional()
  is_active?: boolean;
}

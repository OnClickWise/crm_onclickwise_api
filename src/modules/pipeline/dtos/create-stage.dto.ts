import { IsString, IsOptional } from 'class-validator';
import type { PipelineStageType } from '../entities/pipeline_stage-type';





export class CreateStageDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  color: string;

  @IsOptional()
  stage_type?: PipelineStageType;

  @IsOptional()
  order?: number;
}

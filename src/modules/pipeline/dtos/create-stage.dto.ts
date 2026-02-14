import { IsString, IsOptional } from 'class-validator';
import { PipelineStageType } from '../entities/pipeline-stage.entity';


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

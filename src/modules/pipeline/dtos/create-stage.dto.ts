import { IsString, IsOptional } from 'class-validator';
<<<<<<< HEAD
//import type { PipelineStageType } from '../entities/pipeline-stage.entity';
=======
import type { PipelineStageType } from '../entities/pipeline_stage-type';



>>>>>>> accdf6b81b56926faab92adf158875e8d5375c8b


export class CreateStageDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsString()
  color!: string;

  //@IsOptional()
  //stage_type?: PipelineStageType;

  @IsOptional()
  order?: number;
}

import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ProspectingSequencesService } from './sequences.service';
import {
  CompleteExecutionDto,
  CreateSequenceDto,
  CreateStepDto,
  EnrollPeopleDto,
  UpdateEnrollmentDto,
  UpdateSequenceDto,
  UpdateStepDto,
} from './dtos/sequence.dto';
import type { EnrollmentStatus, SequenceStatus } from './dtos/sequence.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/sequences')
@UseGuards(JwtAuthGuard)
export class ProspectingSequencesController {
  constructor(private readonly service: ProspectingSequencesService) {}

  // Sequences
  @Get()
  list(@Req() req: AuthRequest, @Query('status') status?: SequenceStatus) {
    return this.service.list(req.user, status);
  }

  @Get('inbox')
  inbox(
    @Req() req: AuthRequest,
    @Query('mineOnly', new DefaultValuePipe(false), ParseBoolPipe) mineOnly?: boolean,
  ) {
    return this.service.listPendingExecutions(req.user, mineOnly);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateSequenceDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSequenceDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  // Steps
  @Post(':id/steps')
  addStep(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() body: CreateStepDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.addStep(sequenceId, body, req.user);
  }

  @Patch(':id/steps/:stepId')
  updateStep(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() body: UpdateStepDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateStep(sequenceId, stepId, body, req.user);
  }

  @Delete(':id/steps/:stepId')
  removeStep(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.removeStep(sequenceId, stepId, req.user);
  }

  // Enrollments
  @Post(':id/enroll')
  enroll(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() body: EnrollPeopleDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.enrollPeople(sequenceId, body, req.user);
  }

  @Get(':id/enrollments')
  listEnrollments(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Req() req: AuthRequest,
    @Query('status') status?: EnrollmentStatus,
  ) {
    return this.service.listEnrollments(sequenceId, req.user, status);
  }

  @Patch('enrollments/:enrollmentId')
  updateEnrollment(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() body: UpdateEnrollmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateEnrollment(enrollmentId, body, req.user);
  }

  // Executions
  @Post('executions/:executionId/complete')
  completeExecution(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() body: CompleteExecutionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.completeExecution(executionId, body, req.user);
  }
}

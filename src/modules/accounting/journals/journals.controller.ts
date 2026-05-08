import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { JournalsService } from './journals.service';
import { CreateJournalDto } from './dtos/create-journal.dto';
import { UpdateJournalDto } from './dtos/update-journal.dto';
import { CreateJournalDocumentDto } from './dtos/create-journal-document.dto';
import { UpdateJournalDocumentDto } from './dtos/update-journal-document.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('accounting/journals')
@UseGuards(JwtAuthGuard)
export class JournalsController {
  constructor(private readonly service: JournalsService) {}

  // ─── DIÁRIOS ───────────────────────────────────────────────────────────

  @Post()
  create(@Body() body: CreateJournalDto, @Req() req: AuthRequest) {
    return this.service.createJournal(body, req.user);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('isActive') isActive?: string,
    @Query('journalType') journalType?: string,
    @Query('query') query?: string,
  ) {
    const normalizedIsActive =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.listJournals(req.user, {
      isActive: normalizedIsActive,
      journalType,
      query,
    });
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getJournal(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateJournalDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateJournal(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.removeJournal(id, req.user);
  }

  // ─── DOCUMENTOS ────────────────────────────────────────────────────────

  @Post(':id/documents')
  createDocument(
    @Param('id', ParseUUIDPipe) journalId: string,
    @Body() body: CreateJournalDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createDocument(journalId, body, req.user);
  }

  @Get(':id/documents')
  listDocuments(@Param('id', ParseUUIDPipe) journalId: string, @Req() req: AuthRequest) {
    return this.service.listDocuments(journalId, req.user);
  }

  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id', ParseUUIDPipe) journalId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: UpdateJournalDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateDocument(journalId, documentId, body, req.user);
  }

  @Delete(':id/documents/:documentId')
  removeDocument(
    @Param('id', ParseUUIDPipe) journalId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.removeDocument(journalId, documentId, req.user);
  }
}

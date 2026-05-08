import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AccountingService } from './services/accounting.service';
import { CreateJournalEntryDto } from './dtos/create-journal-entry.dto';
import { ReverseJournalEntryDto } from './dtos/reverse-journal-entry.dto';

@Controller('accounting/journal-entries')
@UseGuards(JwtAuthGuard)
export class JournalEntriesController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post()
  create(@Body() body: CreateJournalEntryDto, @Req() req: any) {
    return this.accountingService.createJournalEntry(body, req.user);
  }

  @Get()
  list(
    @Req() req: any,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('referenceType') referenceType?: string,
    @Query('journalId') journalId?: string,
    @Query('documentId') documentId?: string,
  ) {
    return this.accountingService.listJournalEntries(req.user, {
      limit,
      startDate,
      endDate,
      status,
      accountId,
      referenceType,
      journalId,
      documentId,
    });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.accountingService.getJournalEntry(id, req.user);
  }

  @Post(':id/reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReverseJournalEntryDto,
    @Req() req: any,
  ) {
    return this.accountingService.reverseJournalEntry(id, body, req.user);
  }
}

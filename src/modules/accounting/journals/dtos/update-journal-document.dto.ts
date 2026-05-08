import { PartialType } from '@nestjs/mapped-types';
import { CreateJournalDocumentDto } from './create-journal-document.dto';

export class UpdateJournalDocumentDto extends PartialType(CreateJournalDocumentDto) {}

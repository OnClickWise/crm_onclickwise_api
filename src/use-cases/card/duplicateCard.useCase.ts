import { Injectable } from '@nestjs/common';
import { CardService } from '@/modules/card/services/card.service';

@Injectable()
export class DuplicateCardUseCase {
  constructor(private readonly cardService: CardService) {}

  async execute(id: string, user: any) {
    return this.cardService.duplicateCard(id, user);
  }
}
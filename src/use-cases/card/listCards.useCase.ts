import { Injectable } from '@nestjs/common';
import { CardService } from '@/modules/card/services/card.service';

@Injectable()
export class ListCardsUseCase {
  constructor(private readonly cardService: CardService) {}

  async execute(listId: string, user: any) {
    return this.cardService.listCards(listId, user);
  }
}


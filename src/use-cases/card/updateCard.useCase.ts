import { Injectable } from '@nestjs/common';
import { CardService } from '@/modules/card/services/card.service';

@Injectable()
export class UpdateCardUseCase {
  constructor(private readonly cardService: CardService) {}

  async execute(id: string, data: any, user: any) {
    return this.cardService.updateCard(id, data, user);
  }
}


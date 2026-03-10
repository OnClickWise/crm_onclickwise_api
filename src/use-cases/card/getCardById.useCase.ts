import { Injectable } from '@nestjs/common';
import { CardService } from '@/modules/card/services/card.service';

@Injectable()
export class GetCardByIdUseCase {
  constructor(private readonly cardService: CardService) {}

  async execute(id: string, user: any) {
    return this.cardService.getCardById(id, user);
  }
}


import { Injectable } from '@nestjs/common';
import { CardService } from '@/modules/card/services/card.service';

@Injectable()
export class CreateCardUseCase {
  constructor(private readonly cardService: CardService) {}

  async execute(data: any, user: any) {
    return this.cardService.createCard(data, user);
  }
}

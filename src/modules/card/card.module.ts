import { Module } from '@nestjs/common';
import { CardController } from './card.controller';
import { CardService } from './services/card.service';
import { CreateCardUseCase } from '@/use-cases/card/createCard.useCase';
import { ListCardsUseCase } from '@/use-cases/card/listCards.useCase';
import { GetCardByIdUseCase } from '@/use-cases/card/getCardById.useCase';
import { UpdateCardUseCase } from '@/use-cases/card/updateCard.useCase';
import { DeleteCardUseCase } from '@/use-cases/card/deleteCard.useCase';
import { DuplicateCardUseCase } from '@/use-cases/card/duplicateCard.useCase';
import { DatabaseModule } from '@/shared/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CardController],
  providers: [
    CardService,
    CreateCardUseCase,
    ListCardsUseCase,
    GetCardByIdUseCase,
    UpdateCardUseCase,
    DeleteCardUseCase,
    DuplicateCardUseCase,
  ],
})
export class CardModule {}

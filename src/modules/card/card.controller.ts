import { Controller, Post, Get, Put, Delete, Param, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { CreateCardUseCase } from '@/use-cases/card/createCard.useCase';
import { ListCardsUseCase } from '@/use-cases/card/listCards.useCase';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { GetCardByIdUseCase } from '@/use-cases/card/getCardById.useCase';
import { UpdateCardUseCase } from '@/use-cases/card/updateCard.useCase';
import { DeleteCardUseCase } from '@/use-cases/card/deleteCard.useCase';
import { DuplicateCardUseCase } from '@/use-cases/card/duplicateCard.useCase';

@Controller('cards')
export class CardController {
  constructor(
    private createCard: CreateCardUseCase,
    private listCards: ListCardsUseCase,
    private getCardById: GetCardByIdUseCase,
    private updateCard: UpdateCardUseCase,
    private deleteCard: DeleteCardUseCase,
    private duplicateCard: DuplicateCardUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getCardById.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateCard.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteCard.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @Request() req: any) {
    return this.duplicateCard.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createCard.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Query('listId') listId: string,
    @Query('columnId') columnId: string,
    @Request() req: any,
  ) {
    const resolvedListId = listId || columnId;

    if (!resolvedListId) {
      throw new BadRequestException('Parâmetro obrigatório: listId (ou columnId)');
    }

    return this.listCards.execute(resolvedListId, req.user);
  }
}

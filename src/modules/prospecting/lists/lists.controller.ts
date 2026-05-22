import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ProspectingListsService } from './lists.service';
import { AddItemsDto, CreateListDto, UpdateListDto } from './dtos/list.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/lists')
@UseGuards(JwtAuthGuard)
export class ProspectingListsController {
  constructor(private readonly service: ProspectingListsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('includeArchived', new DefaultValuePipe(false), ParseBoolPipe)
    includeArchived?: boolean,
  ) {
    return this.service.listLists(req.user, { includeArchived });
  }

  @Post()
  create(@Body() body: CreateListDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getDetail(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateListDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  @Post(':id/items')
  addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddItemsDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.addItems(id, body, req.user);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.removeItem(id, itemId, req.user);
  }
}

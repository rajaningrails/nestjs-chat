import { Controller, Post, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { CreateGroupUseCase } from './use-cases/create-group.use-case';
import type { ICreateGroup } from './repositories/group.repository.interface';

@Controller('group')
export class GroupController {
  constructor(private readonly createGroupUseCase: CreateGroupUseCase) {}

  @Post('create')
  async create(@Body() createGroupDto: ICreateGroup): Promise<any> {
    const result = await this.createGroupUseCase.execute(createGroupDto);
    return {
      conversation_id: result.conversation_id,
      group_id: result.group_id,
    };
  }
}
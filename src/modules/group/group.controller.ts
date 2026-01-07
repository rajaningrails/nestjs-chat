import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Inject,
  Query,
} from '@nestjs/common';
import { CreateGroupUseCase } from './use-cases/create-group.use-case';
import { UpdateGroupUseCase } from './use-cases/update-group.use-case';
import { CreateChatGroupDto, UpdateGroupDto } from './dto/chat-group.dto';
import { ChatGroup } from './entities/chat-group.entity';
import { GroupRepository } from './repositories/group.repository';
import { IGroupRepositoryToken } from './repositories/group.repository.interface';
import { UserType } from '../users/dto/user-type.enum';

interface IResponse {
  conversation_id: number;
  group_id: number;
}
@Controller('group')
export class GroupController {
  constructor(
    private readonly createGroupUseCase: CreateGroupUseCase,
    private readonly updateGroupUseCase: UpdateGroupUseCase,

    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
  ) {}

  @Post('create')
  async create(@Body() createGroupDto: CreateChatGroupDto): Promise<IResponse> {
    const result = await this.createGroupUseCase.execute(createGroupDto);
    return {
      conversation_id: result.conversation_id,
      group_id: result.group_id,
    };
  }

  @Post('update')
  async update(
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<Partial<IResponse>> {
    const result = await this.updateGroupUseCase.execute(updateGroupDto);
    return {
      group_id: result.group_id,
    };
  }

  @Get('getGroupNamesByUserId')
  async getGroupNamesByUserId(
    @Query('school_id') school_id: number,
    @Query('user_id') user_id: number,
  ): Promise<ChatGroup[] | null> {
    return this.groupRepository.getGroupNamesByUserId(school_id, user_id);
  }

  @Get(':id')
  async findById(@Param('id') id: number): Promise<ChatGroup | null> {
    return this.groupRepository.findByIdWithGroupMembers(id);
  }

  @Get('getGroupList')
  async getGroupList(
    @Query('school_id') school_id: number,
    @Query('user_id') user_id: number,
    @Query('level') level: UserType,
  ): Promise<ChatGroup[] | null> {
    return this.groupRepository.getGroupList(school_id, user_id, level);
  }
}

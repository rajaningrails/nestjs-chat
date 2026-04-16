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
import { CreateChatGroupDto, GetGroupDto, GetGroupNameDto, UpdateGroupDto } from './dto/chat-group.dto';
import { ChatGroup } from './entities/chat-group.entity';
import { GroupRepository } from './repositories/group.repository';
import { IGroupRepositoryToken } from './repositories/group.repository.interface';
import { UserType } from '../users/dto/user-type.enum';

@Controller()
export class GroupController {
  constructor(
    private readonly createGroupUseCase: CreateGroupUseCase,
    private readonly updateGroupUseCase: UpdateGroupUseCase,

    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
  ) {}

  @Post('group/create')
  async create(@Body() createGroupDto: CreateChatGroupDto) {
    console.log('incoming request', createGroupDto);
    const result = await this.createGroupUseCase.execute(createGroupDto);
    return result;
  }

  @Post('group/update')
  async update(
    @Body() updateGroupDto: UpdateGroupDto,
  ) {
    const result = await this.updateGroupUseCase.execute(updateGroupDto);
    return result;
  }

  @Get('getGroupNames')
  async getGroupNamesByUserId(
    @Query() query: GetGroupNameDto
  ): Promise<ChatGroup[] | null> {
    return this.groupRepository.getGroupNames(query);
  }

  @Post('getGroupDetailsByGroupId')
  async findById(@Body() request: GetGroupDto): Promise<ChatGroup | null> {
    return this.groupRepository.findByIdWithGroupMembers(request?.group_id);
  }

  // @Get('getGroupDetails')
  // async findByConversationId(@Param('conversation_id') conversation_id: ): Promise<ChatGroup | null> {
  //   return this.groupRepository.findByIdWithGroupMembers(id);
  // }

  @Get('manageGroup')
  async getGroupMembersDetail(@Param('group_id') id: GetGroupDto['group_id']): Promise<ChatGroup | null> {
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

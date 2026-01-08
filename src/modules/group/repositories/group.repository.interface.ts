import { CreateChatGroupDto, UpdateGroupDto } from '../dto/chat-group.dto';
import { ChatGroup } from '../entities/chat-group.entity';

export const IGroupRepositoryToken = Symbol('IGroupRepository');

export interface IUpdateGroup {
  group_id: number;
  group_name: string;
  school_id: number;
  created_by: number;
  image: string;
  staffDetails: Array<any>;
  studentDetails: Array<any>;
}

export interface ICreateGroup {
  group_name: string;
  school_id: number;
  created_by: number;
  image: string;
  staffDetails: Array<any>;
  studentDetails: Array<any>;
  sender_name: string;
  sender_image: string;
  sender_level: string;
  sender_class: string;
  sender_section: string;
}

export interface IRepositoryGroupResponse {
  group_id: string;
}
export interface IGroupRepository {
  update({
    created_by,
    group_id,
    group_name,
    group_image,
    school_id,
    staffDetails,
    studentDetails,
  }: UpdateGroupDto): Promise<IRepositoryGroupResponse>;

  create({
    created_by,
    group_name,
    group_image,
    school_id,
    staffDetails,
    studentDetails,
  }: CreateChatGroupDto): Promise<IRepositoryGroupResponse>;

  getGroupNamesByUserId(
    school_id: number,
    user_id: number,
  ): Promise<ChatGroup[] | null>;

  findByIdWithGroupMembers(id: string): Promise<ChatGroup | null>;
}

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

export interface IGroupResponse {
  conversation_id: number;
}
export interface IGroupRepository {
  //   findGroup(conversationId: number): Promise<ChatGroup>;

  //   update({
  //     created_by,
  //     group_id,
  //     group_name,
  //     image,
  //     school_id,
  //     staffDetails,
  //     studentDetails,
  //   }: IUpdateGroup): Promise<IGroupResponse>;

  create({
    created_by,
    group_name,
    image,
    school_id,
    staffDetails,
    studentDetails,
  }: ICreateGroup): Promise<{
    group_id: number;
  }>;

  //   findGroupById(groupId: number): Promise<ChatGroup | null>;

  //   getGroupNames(school_id: number, user_id: number): Promise<Array<string>>;

  //   getGroupMembers(groupId: number): Promise<Array<any>>;

  //   getGroupList({
  //     school_id,
  //     level,
  //     user_id,
  //   }: {
  //     school_id: number;
  //     level: string;
  //     user_id: number;
  //   }): Promise<Array<any>>;
}

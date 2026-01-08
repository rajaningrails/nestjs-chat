import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
  PrimaryColumn,
} from 'typeorm';
import { ChatGroupMember } from './chat-group-member.entity';
import { GroupMessageSeen } from './chat-group-message-seen.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Conversation } from 'src/modules/conversations/entities/conversation.entity';
import { IsUUID } from 'class-validator';

@Entity('chat_groups')
@Index(['group_name'], { unique: true })
@Index('idx_school_id', ['school_id'])
@Index('idx_created_by', ['created_by'])
export class ChatGroup {
  @PrimaryColumn('uuid')
  @IsUUID()
  id: string;

  @Column({ type: 'int', nullable: true })
  school_id?: number;

  @Column({ type: 'varchar', length: 255 })
  group_name: string;

  @Column({ type: 'text', nullable: true })
  group_image?: string;

  @Column({ type: 'int' })
  created_by: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deleted_at: Date;

  @ManyToOne(() => User, (user) => user.createdGroups, { nullable: false })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'user_id' })
  creator: User;

  @OneToMany(() => ChatGroupMember, (member) => member.group, { cascade: true })
  members: ChatGroupMember[];

  @OneToMany(() => GroupMessageSeen, (seen) => seen.group)
  seen_messages: GroupMessageSeen[];

  @OneToMany(() => Conversation, (conversation) => conversation.group)
  conversations: Conversation[];
}
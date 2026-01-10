import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { ChatGroup } from './chat-group.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { IsUUID } from 'class-validator';
import { Conversation } from 'src/modules/conversations/entities/conversation.entity';
import { Message } from 'src/modules/messages/entities/message.entity';

@Entity('group_message_seen')
@Index(['conversation_id', 'message_id', 'user_id'], { unique: true })
@Index('idx_conversation_message', ['conversation_id', 'message_id'])
@Index('idx_user_seen', ['user_id', 'conversation_id'])
export class GroupMessageSeen {
  @PrimaryColumn('uuid')
  @IsUUID()
  id: string;

  @Column({ type: 'string' })
  conversation_id: string;

  @Column({ type: 'string' })
  message_id: string;

  @Column({ type: 'string' })
  group_id: string;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;

  @ManyToOne(() => ChatGroup, (group) => group.seen_messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id', referencedColumnName: 'id' })
  group: ChatGroup;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: User;

  @ManyToOne(() => Conversation, (conversation) => conversation.seen_messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id', referencedColumnName: 'id' })
  conversation: Conversation;

  @ManyToOne(() => Message, (message) => message.seen_messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id', referencedColumnName: 'id' })
  message: Message;
}

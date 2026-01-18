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
import { Conversation } from 'src/modules/conversations/entities/conversation.entity';
import { Message } from 'src/modules/messages/entities/message.entity';

@Entity('group_message_seen')
@Index(['conversation_id', 'message_id', 'user_id'], { unique: true })
export class GroupMessageSeen {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', unsigned: true })
  conversation_id: number;

  @Column({ type: 'bigint', unsigned: true })
  message_id: number;

  @Column({ type: 'bigint', unsigned: true })
  group_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Conversation, (c) => c.seen_messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => ChatGroup, (g) => g.seen_messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;

  @ManyToOne(() => Message, (m) => m.seen_messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: Message;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: User;
}

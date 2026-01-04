import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatGroup } from './chat-group.entity';
import { User } from 'src/modules/users/entities/user.entity';

@Entity('group_message_seen')
@Index(['conversation_id', 'message_id', 'user_id'], { unique: true })
@Index('idx_conversation_message', ['conversation_id', 'message_id'])
@Index('idx_user_seen', ['user_id', 'conversation_id'])
export class GroupMessageSeen {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  conversation_id: number;

  @Column({ type: 'int' })
  message_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;

  @ManyToOne(() => ChatGroup, (group) => group.seen_messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id', referencedColumnName: 'id' })
  group: ChatGroup;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: User;
}
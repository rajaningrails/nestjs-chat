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

@Entity('group_message_seen')
@Index(['conversation_id', 'message_id', 'user_id'], { unique: true })
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


  @ManyToOne(() => ChatGroup, (group) => group.seen_messages)
  @JoinColumn({ name: 'conversation_id', referencedColumnName: 'id' })
  group: ChatGroup;
}

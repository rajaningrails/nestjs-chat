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

@Entity('chat_group_members')
@Index(['group_id', 'user_id'], { unique: true })
export class ChatGroupMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  group_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updated_at: Date;


  @ManyToOne(() => ChatGroup, (group) => group.members)
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;
}

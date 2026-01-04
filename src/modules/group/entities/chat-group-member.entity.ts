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

@Entity('chat_group_members')
@Index(['group_id', 'user_id'], { unique: true })
@Index('idx_group_id', ['group_id'])
@Index('idx_user_id', ['user_id'])
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

  @ManyToOne(() => ChatGroup, (group) => group.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: User;
}
import {
  Entity,
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

@Entity('chat_group_members')
@Index(['group_id', 'user_id'], { unique: true })
@Index('idx_group_id', ['group_id'])
@Index('idx_user_id', ['user_id'])
export class ChatGroupMember {
  @PrimaryColumn('uuid')
  @IsUUID()
  id: string;

  @Column({ type: 'varchar', length: 36 })
  group_id: string;

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
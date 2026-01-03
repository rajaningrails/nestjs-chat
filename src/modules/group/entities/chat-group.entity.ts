import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatGroupMember } from './chat-group-member.entity';
import { GroupMessageSeen } from './chat-group-message-seen.entity';

@Entity('chat_groups')
export class ChatGroup {
  @PrimaryGeneratedColumn()
  id: number;

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


  @OneToMany(() => ChatGroupMember, (member) => member.group)
  members: ChatGroupMember[];

  @OneToMany(() => GroupMessageSeen, (seen) => seen.group)
  seen_messages: GroupMessageSeen[];
}

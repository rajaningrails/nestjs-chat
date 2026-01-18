import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ConversationType, GroupType } from '../dto/conversations.enum';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';
import { Message } from 'src/modules/messages/entities/message.entity';
import { GroupMessageSeen } from 'src/modules/group/entities/chat-group-message-seen.entity';

@Entity('conversations')
@Index('idx_school_id', ['school_id'])
@Index('idx_type', ['type'])
@Index('idx_group_id', ['group_id'])
@Index('idx_last_message_id', ['last_message_id'])
@Index('idx_participants', ['school_id', 'type'])
@Index('idx_updated_at', ['updated_at'])
export class Conversation {
  @PrimaryColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  group_id?: number;

  @Column({ type: 'enum', enum: ConversationType })
  type: ConversationType;

  @Column({ type: 'enum', enum: GroupType, nullable: true })
  group_type: GroupType;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  last_message_id?: number;

  @Column({ type: 'int', nullable: true })
  last_message_sender_id?: number;

  @Column({ type: 'int', nullable: true })
  last_message_receiver_id?: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date;

  @ManyToOne(() => ChatGroup, (group) => group.conversations, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'group_id', referencedColumnName: 'id' })
  group: ChatGroup;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @ManyToOne(() => Message, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'last_message_id', referencedColumnName: 'id' })
  lastMessage?: Message;

  @OneToMany(() => GroupMessageSeen, (seen) => seen.conversation)
  seen_messages: GroupMessageSeen[];
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ConversationType, GroupType } from '../dto/conversations.enum';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';
import { Message } from 'src/modules/messages/entities/message.entity';

@Entity('conversations')
@Index('idx_school_id', ['school_id'])
@Index('idx_type', ['type'])
@Index('idx_group_id', ['group_id'])
@Index('idx_last_message_id', ['last_message_id'])
@Index('idx_participants', ['school_id', 'type'])
@Index('idx_updated_at', ['updated_at'])
export class Conversation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: bigint;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'int', nullable: true })
  group_id: number | null;

  @Column({ type: 'enum', enum: ConversationType })
  type: ConversationType;

  @Column({ type: 'enum', enum: GroupType, nullable: true })
  group_type: GroupType | null;

  @Column({ type: 'bigint', nullable: true })
  last_message_id: bigint | null;

  @Column({ type: 'text', nullable: true })
  last_message: string | null;

  @Column({ type: 'int', nullable: true })
  last_message_sender_id: number | null;

  @Column({ type: 'int', nullable: true })
  last_message_receiver_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  last_message_seen_at: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;

  @UpdateDateColumn({ name: 'deleted_at', type: 'timestamp' })
  deleted_at: Date;

  @ManyToOne(() => ChatGroup, (group) => group.conversations, { 
    nullable: true,
    onDelete: 'SET NULL'
  })
  @JoinColumn({ name: 'group_id', referencedColumnName: 'id' })
  group: ChatGroup | null;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @ManyToOne(() => Message, { 
    nullable: true,
    onDelete: 'SET NULL'
  })
  @JoinColumn({ name: 'last_message_id', referencedColumnName: 'id' })
  lastMessage?: Message | null;
}
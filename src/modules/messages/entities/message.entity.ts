import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { Conversation } from 'src/modules/conversations/entities/conversation.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';
import { IsUUID } from 'class-validator';

@Entity('messages')
@Index('idx_conversation_id', ['conversation_id'])
@Index('idx_school_id', ['school_id'])
@Index('idx_sender_id', ['sender_id'])
@Index('idx_group_id', ['group_id'])
@Index('idx_created_at', ['created_at'])
@Index('idx_conversation_created', ['conversation_id', 'created_at'])
@Index('idx_seen_at', ['seen_at'])
export class Message {
  @PrimaryColumn('uuid')
  @IsUUID()
  id: string;

  @Column({ type: 'string', nullable: false })
  conversation_id: string;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'int' })
  sender_id: number;

  @Column({ type: 'int', nullable: true })
  receiver_id: number;

  @Column({ type: 'string', nullable: true })
  group_id: string;

  @Column({
    type: 'text',
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
    nullable: true,
  })
  message: string;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @Column({ type: 'timestamp', nullable: true })
  seen_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deleted_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { 
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'conversation_id', referencedColumnName: 'id' })
  conversation: Conversation;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'sender_id', referencedColumnName: 'user_id' })
  sender: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'receiver_id', referencedColumnName: 'user_id' })
  receiver?: User;

  @ManyToOne(() => ChatGroup, { nullable: true })
  @JoinColumn({ name: 'group_id', referencedColumnName: 'id' })
  group?: ChatGroup;
}
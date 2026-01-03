import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ConversationType, GroupType } from '../dto/conversations.enum';

@Entity('conversations')
@Index(['school_id'])
@Index(['type'])
@Index(['group_id'])
export class Conversation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'int', nullable: true })
  group_id: number | null;

  @Column({
    type: 'enum',
    enum: ConversationType,
  })
  type: ConversationType;

  @Column({
    type: 'enum',
    enum: GroupType,
    nullable: true,
  })
  group_type: GroupType | null;

  /* ---------- last message cache ---------- */

  @Column({ type: 'bigint', nullable: true })
  last_message_id: number | null;

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
}

export default Conversation;

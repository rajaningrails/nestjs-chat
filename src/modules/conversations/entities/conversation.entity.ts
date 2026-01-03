import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  sender_id: number;

  @Index()
  @Column({ type: 'int' })
  receiver_id: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  group_id: number | null;

  @Index({ unique: true })
  @Column({ type: 'bigint' })
  message_id: number;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', default: false })
  message_deleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  message_seen: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

export default Conversation;
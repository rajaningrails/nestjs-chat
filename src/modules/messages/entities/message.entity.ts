import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  sender_id: number;

  @Column({ type: 'int', nullable: true })
  receiver_id: number | null;

  @Column({ type: 'int', nullable: true })
  group_id: number | null;

  @Index()
  @Column({ type: 'int', nullable: false })
  conversation_id: number | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  images: string[] | null;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  message_type: MessageType;

  @Column({ type: 'timestamp', nullable: true })
  seenAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp' })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

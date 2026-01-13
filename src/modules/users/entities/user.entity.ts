import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { UserType } from '../dto/user-type.enum';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';

@Entity('users')
@Unique(['school_id', 'user_id'])
@Index(['user_id'])
export class User {
  @PrimaryColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'text' })
  name?: string;

  @Column({ type: 'text', nullable: true })
  image?: string;

  @Column({
    type: 'enum',
    enum: UserType,
  })
  type: UserType;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ChatGroup, (group) => group.creator)
  createdGroups: ChatGroup[];
}

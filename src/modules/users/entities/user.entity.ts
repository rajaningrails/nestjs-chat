import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
  OneToMany,
} from 'typeorm';
import { UserType } from '../dto/user-type.enum';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';

@Entity('users')
@Unique('unique_user', ['school_id', 'user_id'])
@Index('idx_user_id', ['user_id'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'text' })
  name?: string;

  @Column({ type: 'text', nullable: true })
  image?: string | null;

  @Column({
    type: 'enum',
    enum: UserType,
  })
  type: UserType;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => ChatGroup, (group) => group.creator)
  createdGroups: ChatGroup[];
}

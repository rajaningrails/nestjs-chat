import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IsAdmin, UserType } from '../dto/user-type.enum';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';

@Entity('users')
@Index('IDX_USER_USER_ID', ['user_id'])
@Unique('UQ_USER_SCHOOL_USER', ['user_id'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  school_id: number;

  @Column({ type: 'int', unique: true })
  user_id: number;

  @Column({type: 'text'})
  name: string;
  
  @Column({type: 'text', nullable: true})
  image: string;

  @Column({type: 'enum', enum: UserType})
  type: UserType;

  @Column({type: 'enum', enum: IsAdmin, default: IsAdmin.NO})
  is_admin: IsAdmin;

  @Column({type:'text', nullable: true})
  class: string;

  @Column({type:"text", nullable: true})
  section: string;
  
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ChatGroup, (group) => group.creator)
  createdGroups: ChatGroup[];
}

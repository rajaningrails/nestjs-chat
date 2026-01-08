import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConversationRepository } from '../repositories/conversation.repository';
import { DataSource } from 'typeorm';

interface UserContact {
    id: number;
    name: string;
    email: string;
    avatar?: string;
}

@Injectable()
export class ConversationService {
    private readonly logger = new Logger(ConversationService.name);

    constructor(
        private readonly conversationRepository: ConversationRepository,
        private readonly dataSource: DataSource,
    ) { }

    async getUserConversations(userId: number) {
        try {
            return await this.conversationRepository.findByUserId(userId);
        } catch (error) {
            throw error;
        }
    }

    async getUserContacts(userId: number): Promise<UserContact[]> {
        try {
            const conversations = await this.conversationRepository
                .findByUserId(userId);

            const contactIds = new Set<number>();

            for (const conversation of conversations) {
                if (conversation.type === 'user') {
                    if (conversation.last_message_sender_id !== userId) {
                        contactIds.add(conversation.last_message_sender_id!);
                    }
                    if (conversation.last_message_receiver_id && conversation.last_message_receiver_id !== userId) {
                        contactIds.add(conversation.last_message_receiver_id);
                    }
                } else if (conversation.type === 'group' && conversation.group_id) {
                    const groupMembers = await this.getGroupMembers(conversation.group_id);
                    groupMembers.forEach(memberId => {
                        if (memberId !== userId) {
                            contactIds.add(memberId);
                        }
                    });
                }
            }

            if (contactIds.size === 0) {
                return [];
            }

            const contacts = await this.dataSource.query(
                `
                SELECT 
                id,
                name,
                email,
                avatar
                FROM users
                WHERE id = ANY($1)
                `,
                [Array.from(contactIds)]
            );

            return contacts;
        } catch (error) {
            this.logger.error(`Failed to get contacts for user ${userId}:`, error);
            return [];
        }
    }

    async getGroupMembers(groupId: number): Promise<number[]> {
        try {
            const members = await this.dataSource.query(
                `
        SELECT user_id 
        FROM group_members 
        WHERE group_id = $1 AND deleted_at IS NULL
        `,
                [groupId]
            );

            return members.map((m: any) => m.user_id);
        } catch (error) {
            this.logger.error(`Failed to get group members for group ${groupId}:`, error);
            return [];
        }
    }

    async deleteConversation(conversationId: string) {
        try {

            await this.dataSource.query(
                `
                    UPDATE conversations
                    SET deleted_at = NOW()
                    WHERE id = $1
                `,
                [conversationId]
            );

            return { success: true };
        } catch (error) {
            this.logger.error(`Failed to delete conversation ${conversationId}:`, error);
            throw error;
        }
    }
}
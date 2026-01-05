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

    /**
     * Get all conversations for a user
     */
    async getUserConversations(userId: number) {
        try {
            return await this.conversationRepository.findByUserId(userId);
        } catch (error) {
            this.logger.error(`Failed to get conversations for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get all contacts for a user (people they've had conversations with)
     */
    async getUserContacts(userId: number): Promise<UserContact[]> {
        try {
            // Get all conversations where user is a participant
            const conversations = await this.conversationRepository
                .findByUserId(userId);

            const contactIds = new Set<number>();

            // Extract unique contact IDs from conversations
            for (const conversation of conversations) {
                if (conversation.type === 'user') {
                    // Direct message - add the other user
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

            // Fetch user details for all contacts
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

    /**
     * Get all members of a group
     */
    async getGroupMembers(groupId: number): Promise<number[]> {
        try {
            // Assuming you have a group_members or similar table
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

    /**
     * Delete conversation (soft delete)
     */
    async deleteConversation(conversationId: number, userId: number) {
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
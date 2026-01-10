export interface QueueConfig {
  queue_name: string;
  no_of_jobs: number;
  max_no_of_job_per_second: number;
  batch_size: number;
  batch_timeout: number; // milliseconds
  max_db_retries: number;
  priority: number;
}

export const UserProcessorConfig: QueueConfig = {
  queue_name: 'users',
  no_of_jobs: 10, // no of jobs at same tiem,
  max_no_of_job_per_second: 100,
  batch_size: 100,
  batch_timeout: 5000,
  max_db_retries: 3,
  priority: 1,
};

export const MessageProcessorConfig = {
  queue_name: 'messages',
  no_of_jobs: 20, // no of jobs at same tiem,
  max_no_of_job_per_second: 200,
  batch_size: 200,
  batch_timeout: 3000,
  max_db_retries: 5,
  priority: 1,
};

export const ConversationProcessorConfig = {
  queue_name: 'conversations',
  no_of_jobs: 10, // no of jobs at same tiem,
  max_no_of_job_per_second: 100,
  batch_size: 100,
  batch_timeout: 5000,
  max_db_retries: 5,
  priority: 2,
};

export const GroupProcessorConfig = {
  queue_name: 'groups',
  no_of_jobs: 10, // no of jobs at same tiem,
  max_no_of_job_per_second: 100,
  batch_size: 100,
  batch_timeout: 5000,
  max_db_retries: 5,
  priority: 3,
};

export const GroupMemberProcessorConfig = {
  queue_name: 'group-member',
  no_of_jobs: 10, // no of jobs at same tiem,
  max_no_of_job_per_second: 100,
  batch_size: 100,
  batch_timeout: 5000,
  max_db_retries: 5,
  priority: 3,
};

export const GroupMemberMessageSeenProcessorConfig = {
  queue_name: 'group-member-message-seen',
  no_of_jobs: 10, // no of jobs at same tiem,
  max_no_of_job_per_second: 150,
  batch_size: 200,
  batch_timeout: 3000,
  max_db_retries: 5,
  priority: 4,
};

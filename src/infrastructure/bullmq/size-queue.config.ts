export const UserProcessorConfig = {
    queue_name: 'users',
    no_of_jobs: 5, // no of jobs at same tiem,
    max_no_of_job_per_second: 50,
    batch_size: 50,
    batch_timeout: 3000,
    max_db_retries: 3,
    priority: 1
}

export const MessageProcessorConfig = {
    queue_name: 'messages',
    no_of_jobs: 10, // no of jobs at same tiem,
    max_no_of_job_per_second: 100,
    batch_size: 100,
    batch_timeout: 3000,
    max_db_retries: 5,
    priority: 1
}

export const ConversationProcessorConfig = {
    queue_name: 'conversations',
    no_of_jobs: 5, // no of jobs at same tiem,
    max_no_of_job_per_second: 50,
    batch_size: 50,
    batch_timeout: 3000,
    max_db_retries: 5,
    priority: 2
}

export const GroupProcessorConfig = {
    queue_name: 'groups',
    no_of_jobs: 5, // no of jobs at same tiem,
    max_no_of_job_per_second: 50,
    batch_size: 50,
    batch_timeout: 3000,
    max_db_retries: 5,
    priority: 3
}
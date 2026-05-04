export interface QueueConfig {
  queue_name: string;
  no_of_jobs: number;
  max_no_of_job_per_second: number;
  batch_size: number;
  batch_timeout: number; // milliseconds
  max_db_retries: number;
  priority: number;
}


export const MessageProcessorConfig = {
  queue_name: 'messages',
  no_of_jobs: 20, // no of jobs at same tiem,
  max_no_of_job_per_second: 200,
  batch_size: 20,
  batch_timeout: 1000,
  max_db_retries: 5,
  priority: 1,
};
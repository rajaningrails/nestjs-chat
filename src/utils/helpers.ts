import { IS_ALPHA } from 'class-validator';
import { ConversationType } from 'src/modules/conversations/dto/conversations.enum';
import { UserType, IsAdmin } from 'src/modules/users/dto/user-type.enum';

export function toMySQLDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<T> {
  const retries = options?.retries ?? 3;

  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export function escapeValue(value: any): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return value.toString();
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function generateSafeNumericId(): number {
  const ts = Math.floor(Date.now() / 1000);
  const random = Math.floor(Math.random() * 100000);
  return ts * 100000 + random;
}

export function handleUserType(type: string): UserType {
  switch (type) {
    case 'parent':
      return UserType?.STUDENT;
    case 'parents':
      return UserType?.STUDENT;
    case 'client':
      return UserType?.STAFF;
    default:
      return type as UserType;
  }
}

export function IsAdminHelper(type: string): IsAdmin {
  switch (type) {
    case 'client':
      return IsAdmin?.YES;
    default:
      return IsAdmin?.NO;
  }
}

export function buildConfigMap(chatConfigs: any[]): Map<string, number> {
  const defaultKeys = [
    'teacher_to_teacher_chat',
    'teacher_to_student_chat',
    'student_group_chat',
    'teacher_group_chat',
  ];

  const configMap = new Map(
    chatConfigs.map((c) => [c.feature_key, Number(c.value)]),
  );

  for (const key of defaultKeys) {
    if (!configMap.has(key)) {
      configMap.set(key, 1);
    }
  }

  return configMap;
}

export function isConversationEnabled(conv: any, chatConfigs: any): boolean {
  chatConfigs = buildConfigMap(chatConfigs);

  const convType = conv?.c_type;
  const groupType = conv?.c_group_type;
  const senderType = conv?.sender_user_type;
  const receiverType = conv?.receiver_user_type;
  if (convType === ConversationType.USER) {
    if (senderType === 'staff' && receiverType === 'staff') {
      return chatConfigs.has('teacher_to_teacher_chat');
    }

    if (
      (senderType === 'staff' && receiverType === 'student') ||
      (senderType === 'student' && receiverType === 'staff')
    ) {
      return chatConfigs.has('teacher_to_student_chat');
    }
  }

  if (convType === ConversationType.GROUP) {
    if (groupType === 'student_group') {
      return chatConfigs.has('student_group_chat');
    }

    if (groupType === 'teacher_group') {
      return chatConfigs.has('teacher_group_chat');
    }
  }

  return true;
}

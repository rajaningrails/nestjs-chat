import { IS_ALPHA } from "class-validator";
import { UserType, IsAdmin } from "src/modules/users/dto/user-type.enum";

export function toMySQLDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  retries = this.MAX_DB_RETRIES,
): Promise<T> {
  let lastError: Error | undefined = undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
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


export function handleUserType(type:string): UserType{
  switch(type){
    case 'parent':
      return UserType?.STUDENT;
    case 'parents':
      return UserType?.STUDENT;
    case 'client':
      return UserType?.STAFF;
    default:
      return type as UserType
  }
}

export function IsAdminHelper(type:string): IsAdmin{
  switch(type){
    case 'client':
      return IsAdmin?.YES;
    default:
      return IsAdmin?.NO
  }
}
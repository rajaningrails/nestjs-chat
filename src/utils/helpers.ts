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

export function escape(value: any): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return value.toString();
  return `'${String(value).replace(/'/g, "''")}'`;
}

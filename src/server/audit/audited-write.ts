export async function auditedWrite<T>(write: () => Promise<T>): Promise<T> {
  return write();
}

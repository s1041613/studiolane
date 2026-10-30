// Pickers list only rows that are still in use; archived rows stay in the
// DB (soft delete) so old bookings keep pointing at them.
export function activeOnly<T extends { archivedAt: string | null }>(items: readonly T[]): T[] {
  return items.filter((item) => item.archivedAt === null);
}

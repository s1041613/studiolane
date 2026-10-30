// C3: marks a soft-deleted settings row. Renders nothing while the row is in
// use; pages that word it differently (用途: 暫不開放) pass their own label.
export function StatusBadge({ archivedAt, label = "已停用" }: { archivedAt: string | null; label?: string }) {
  if (archivedAt === null) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

// Fades the whole row of an archived item so it reads as inactive at a glance.
export function archivedRowClass(archivedAt: string | null): string {
  return archivedAt === null ? "" : "text-muted-foreground";
}

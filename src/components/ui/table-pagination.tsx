import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Not tied to <table> markup: a nav that only knows page, total and
// pageSize, so it works below any list — a Table with stack="md" or a
// plain card list. Lives in ui/ because it's generic.
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="分頁"
      className="flex items-center justify-between gap-3 border-t border-divider-header px-5 py-3 text-[13px] text-muted-foreground"
    >
      <span aria-live="polite" className="tabular-nums">
        第 {from}–{to} 筆，共 {total} 筆
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="icon"
          aria-label="上一頁"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-12 text-center tabular-nums" aria-current="page">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="下一頁"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </nav>
  );
}

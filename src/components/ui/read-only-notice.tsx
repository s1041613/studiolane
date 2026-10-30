// L20: shown on a settings page in ADMIN_PAGES to someone who isn't an
// admin. They can still read everything; the edit controls are hidden.
export function ReadOnlyNotice() {
  return (
    <p role="note" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      只有管理者可以修改這一頁，你可以查看。
    </p>
  );
}

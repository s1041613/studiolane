import { ErrorCode } from "@/components/ui/error-code"

type PageFailureProps = {
  // What an error.tsx / global-error.tsx receives. `digest` is set when a
  // server render threw: Next logs the error under it, so it is the error
  // code to quote. An error thrown in the browser (e.g. a form submission
  // that never reached the server) has none.
  error: Error & { digest?: string }
}

// The one whole-page fallback, shared by every error.tsx and global-error.tsx
// so they can't drift apart: a title, one sentence and the error code,
// centred in the window whatever layout is around it (the sidebar, where
// there is one, stays usable). The error's own message is never shown (in
// production a server error's is generic English, a browser one the engine's
// English). No icon and no button: reloading the page is how to try again.
export function PageFailure({ error }: PageFailureProps) {
  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center px-4">
      <div
        role="alert"
        data-slot="page-failure"
        className="pointer-events-auto flex max-w-[520px] flex-col items-center gap-1.5 p-7 text-center text-sm [&_[data-slot=error-code]]:justify-center"
      >
        <h2 className="text-[15px] font-medium">這個頁面暫時無法顯示</h2>
        <p className="text-text-secondary">可能是網路或系統暫時出了問題，請稍後再試。</p>
        {error.digest && <ErrorCode code={error.digest} />}
      </div>
    </div>
  )
}

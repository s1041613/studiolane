"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

const COPIED_FOR_MS = 2000

type ErrorCodeProps = {
  // A Failure's errorId (src/lib/result.ts) or an error page's digest; shown
  // in capitals.
  code: string
  // false inside a NoticeDialog, which offers only 確定 (DESIGN.md §5.10):
  // the code can still be selected by hand.
  copyable?: boolean
}

// The muted "錯誤代碼 XXXXXXXX 複製" line under a failure's message, to quote
// when reporting it.
export function ErrorCode({ code, copyable = true }: ErrorCodeProps) {
  const shown = code.toUpperCase()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown)
      setCopied(true)
    } catch {}
  }

  return (
    <span data-slot="error-code" className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span className="@max-[180px]:basis-full">錯誤代碼</span>
      <span className="font-mono tracking-wide text-text-secondary select-all">{shown}</span>
      {copyable && (
        <>
          <button
            type="button"
            aria-label="複製錯誤代碼"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-row-action hover:text-foreground"
          >
            {copied ? <CheckIcon aria-hidden className="size-3.5" /> : <CopyIcon aria-hidden className="size-3.5" />}
            <span className="@max-[180px]:hidden">{copied ? "已複製" : "複製"}</span>
          </button>
          {/* The button's new label is not reliably read out; this is. */}
          <span role="status" className="sr-only">
            {copied ? "已複製錯誤代碼" : ""}
          </span>
        </>
      )}
    </span>
  )
}

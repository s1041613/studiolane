import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PageFailure } from "@/components/ui/page-failure"

describe("PageFailure", () => {
  it("a server render error: title, one sentence, and its digest as the error code", () => {
    const error = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2817403954" })
    const html = renderToStaticMarkup(<PageFailure error={error} />)

    expect(html).toContain("這個頁面暫時無法顯示")
    expect(html).toContain("可能是網路或系統暫時出了問題，請稍後再試。")
    expect(html).toContain(">2817403954<")
    expect(html).not.toContain("Server Components")
  })

  it("has no button besides copying the code: reloading is how to try again", () => {
    const error = Object.assign(new Error("x"), { digest: "2817403954" })
    const html = renderToStaticMarkup(<PageFailure error={error} />)

    expect(html).not.toContain("重試")
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it("an error from the browser (e.g. a form request that never got an answer) has no error code", () => {
    const html = renderToStaticMarkup(<PageFailure error={new TypeError("Failed to fetch")} />)

    expect(html).toContain("這個頁面暫時無法顯示")
    expect(html).not.toContain("錯誤代碼")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("Failed to fetch")
  })
})

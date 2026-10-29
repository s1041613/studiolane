import { describe, expect, it, vi } from "vitest";
import { createClickGuard } from "@/lib/click-guard";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("click guard", () => {
  it("BTN-1: 300 毫秒內連點只算第一次", () => {
    const c = clock();
    const guard = createClickGuard({ now: c.now });
    const task = vi.fn();
    guard.run(task);
    c.advance(299);
    guard.run(task);
    expect(task).toHaveBeenCalledTimes(1);
    c.advance(1);
    guard.run(task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("BTN-2: 送到 server 的動作在回應前鎖住，期間再按都不算", async () => {
    const c = clock();
    const guard = createClickGuard({ now: c.now });
    const pending = deferred();
    const task = vi.fn(() => pending.promise);
    const running = guard.run(task);
    expect(guard.isBusy()).toBe(true);
    c.advance(1000);
    guard.run(task);
    expect(task).toHaveBeenCalledTimes(1);
    pending.resolve();
    await running;
    expect(guard.isBusy()).toBe(false);
  });

  it("BTN-2: 同一筆預約的按鈕共用一個 guard，一個在跑時其他的一起鎖住", async () => {
    const c = clock();
    const guard = createClickGuard({ now: c.now });
    const pending = deferred();
    const confirm = vi.fn(() => pending.promise);
    const cancel = vi.fn();
    const running = guard.run(confirm);
    c.advance(1000);
    guard.run(cancel);
    expect(cancel).not.toHaveBeenCalled();
    pending.resolve();
    await running;
  });

  it("BTN-3: 失敗後解鎖，可以再按", async () => {
    const c = clock();
    const guard = createClickGuard({ now: c.now });
    const failing = vi.fn(() => Promise.reject(new Error("連線失敗")));
    await expect(guard.run(failing)).rejects.toThrow("連線失敗");
    expect(guard.isBusy()).toBe(false);
    c.advance(300);
    await expect(guard.run(failing)).rejects.toThrow("連線失敗");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("通知訂閱者 busy 狀態變化（讓按鈕顯示 loading）", async () => {
    const guard = createClickGuard({ now: () => 0 });
    const listener = vi.fn();
    guard.subscribe(listener);
    const pending = deferred();
    const running = guard.run(() => pending.promise);
    pending.resolve();
    await running;
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

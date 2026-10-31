import { describe, expect, it } from "vitest";
import { isNavActive, pageTitle } from "@/components/layout/nav-items";

describe("isNavActive", () => {
  it("keeps 設定 highlighted on every settings page", () => {
    expect(isNavActive("/settings", "/settings")).toBe(true);
    expect(isNavActive("/settings", "/settings/roster")).toBe(true);
  });

  it("highlights 首頁 only on the home page", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/settings")).toBe(false);
  });

  it("highlights 預約教室 only on its own path", () => {
    expect(isNavActive("/bookings/new", "/bookings/new")).toBe(true);
    expect(isNavActive("/bookings/new", "/")).toBe(false);
    expect(isNavActive("/bookings/new", "/bookings")).toBe(false);
  });

  it("highlights 預約列表 on /bookings but not on /bookings/new", () => {
    expect(isNavActive("/bookings", "/bookings")).toBe(true);
    expect(isNavActive("/bookings", "/bookings/new")).toBe(false);
  });

  it("does not match a path that merely shares the prefix", () => {
    expect(isNavActive("/settings", "/settingsx")).toBe(false);
  });
});

describe("pageTitle", () => {
  it("names 預約教室", () => {
    expect(pageTitle("/bookings/new")).toBe("預約教室");
  });

  it("names 預約列表", () => {
    expect(pageTitle("/bookings")).toBe("預約列表");
  });

  it("names 預約明細 for any batch", () => {
    expect(pageTitle("/bookings/batch/abc")).toBe("預約明細");
  });

  it("titles every settings page 設定", () => {
    expect(pageTitle("/settings")).toBe("設定");
    expect(pageTitle("/settings/roster")).toBe("設定");
  });

  it("leaves 首頁 to draw its own heading", () => {
    expect(pageTitle("/")).toBeNull();
  });

  it("returns null for a path with no title", () => {
    expect(pageTitle("/unknown")).toBeNull();
  });
});

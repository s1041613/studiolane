import { describe, expect, it } from "vitest";
import { ADMIN_ONLY, AuthError, DEMO_ACTOR, SIGN_IN_FIRST, requirePageAccess, requireStaff } from "@/server/auth/require-staff";

describe("requireStaff", () => {
  it("resolves the demo admin when no page is given", async () => {
    await expect(requireStaff()).resolves.toEqual(DEMO_ACTOR);
  });

  it("resolves the demo admin for a page, admin-only or not", async () => {
    await expect(requireStaff({ page: "staff" })).resolves.toEqual(DEMO_ACTOR);
  });
});

describe("requirePageAccess", () => {
  it("never redirects (resolves instead of throwing) and lets the demo admin edit", async () => {
    await expect(requirePageAccess("/calendar")).resolves.toEqual({ actor: DEMO_ACTOR, canEdit: true });
  });
});

describe("AuthError", () => {
  it("carries UNAUTHENTICATED with the sign-in message", () => {
    const error = new AuthError("UNAUTHENTICATED");
    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.message).toBe(SIGN_IN_FIRST);
  });

  it("carries PERMISSION_DENIED with the admin-only message", () => {
    const error = new AuthError("PERMISSION_DENIED");
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.message).toBe(ADMIN_ONLY);
  });
});

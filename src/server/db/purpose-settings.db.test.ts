import { describe, expect, it } from "vitest";
import { rejectionOf, withRollback } from "@/server/db/test-db";

// purpose_settings rules from docs/settings/shared/04 (用途 B1–B6).
// Purposes T12, T14, T15; T13 (special rates) moved to purpose_role_pricing
// (purpose-role-pricing.db.test.ts, E-5 T24).

describe("purpose settings (0014)", () => {
  it("T12 / B1: allowed roles need at least one of teacher, staff, customer", async () => {
    await withRollback(async (db) => {
      const setRoles = (roles: string) =>
        rejectionOf(db, "update purpose_settings set allowed_roles = $1::role[] where purpose = 'workshop'", [roles]);
      expect(await setRoles("{}")).toMatch(/purpose_settings_allowed_roles/);
      expect(await setRoles("{guest_teacher}")).toMatch(/purpose_settings_allowed_roles/);
      expect(await setRoles("{teacher,guest_teacher}")).toMatch(/purpose_settings_allowed_roles/);
      expect(await setRoles("{teacher,customer}")).toBeNull();
    });
  });

  it("T14 / B5: the app's role can only read and update rows", async () => {
    await withRollback(async (db) => {
      await db.query("set local role service_role");
      expect(await rejectionOf(db, "select * from purpose_settings")).toBeNull();
      expect(await rejectionOf(db, "update purpose_settings set archived_at = now() where purpose = 'yoga'")).toBeNull();
      expect(
        await rejectionOf(db, "insert into purpose_settings (purpose, allowed_roles) values ('dance', '{teacher}')"),
      ).toMatch(/permission denied/);
      expect(await rejectionOf(db, "delete from purpose_settings where purpose = 'yoga'")).toMatch(/permission denied/);
    });
  });

  it("T15 / B6: seeded with one row per purpose", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ purpose: string; allowed_roles: string; archived_at: Date | null }>(
        "select purpose::text, allowed_roles::text, archived_at from purpose_settings order by purpose::text",
      );
      expect(rows).toEqual([
        { purpose: "aerobics", allowed_roles: "{teacher,staff,customer}", archived_at: null },
        { purpose: "dance", allowed_roles: "{teacher,staff,customer}", archived_at: null },
        { purpose: "front_desk", allowed_roles: "{staff}", archived_at: null },
        { purpose: "performance", allowed_roles: "{teacher}", archived_at: null },
        { purpose: "photography", allowed_roles: "{staff,customer}", archived_at: null },
        { purpose: "private_lesson", allowed_roles: "{teacher}", archived_at: null },
        { purpose: "workshop", allowed_roles: "{teacher}", archived_at: null },
        { purpose: "yoga", allowed_roles: "{teacher,staff,customer}", archived_at: null },
      ]);
    });
  });

  it("stamps updated_at and keeps updated_by on every update", async () => {
    await withRollback(async (db) => {
      await db.query("update purpose_settings set updated_at = '2000-01-01' where purpose = 'yoga'");
      await db.query("update purpose_settings set archived_at = now(), updated_by = 'demo_staff' where purpose = 'yoga'");
      const { rows } = await db.query<{ updated_at: Date; updated_by: string }>(
        "select updated_at, updated_by from purpose_settings where purpose = 'yoga'",
      );
      expect(rows[0].updated_at.getFullYear()).toBeGreaterThan(2000);
      expect(rows[0].updated_by).toBe("demo_staff");
    });
  });
});

import { ADMIN_ONLY, AuthError, SIGN_IN_FIRST } from "@/server/auth/messages";

export type StaffActor = {
  id: string;
  name: string;
  authMethod: "none" | "password";
};

export type SignedInStaff = StaffActor & { isAdmin: boolean };

export { ADMIN_ONLY, AuthError, SIGN_IN_FIRST };

export const DEMO_ACTOR: SignedInStaff = {
  id: "demo-admin",
  name: "示範管理員",
  authMethod: "none",
  isAdmin: true,
};

export const requireStaff: (opts?: { page?: string }) => Promise<StaffActor> = async () => DEMO_ACTOR;

export const requirePageAccess: (path: string) => Promise<{ actor: SignedInStaff; canEdit: boolean }> = async () => ({
  actor: DEMO_ACTOR,
  canEdit: true,
});

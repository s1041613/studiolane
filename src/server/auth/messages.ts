export const SIGN_IN_FIRST = "請先登入";
export const ADMIN_ONLY = "只有管理者可以修改";

type AuthCode = "UNAUTHENTICATED" | "PERMISSION_DENIED";

const MESSAGE: Record<AuthCode, string> = {
  UNAUTHENTICATED: SIGN_IN_FIRST,
  PERMISSION_DENIED: ADMIN_ONLY,
};

export class AuthError extends Error {
  constructor(readonly code: AuthCode) {
    super(MESSAGE[code]);
    this.name = "AuthError";
  }
}

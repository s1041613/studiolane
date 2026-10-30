import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

export type RequestInfo = { vercelRequestId: string | null; page: string | null };

export function newOperationId(): string {
  return randomUUID();
}

export function errorIdOf(operationId: string): string {
  return operationId.slice(0, 8);
}

function pageOf(referer: string | null, host: string | null): string | null {
  if (!referer || !host) return null;
  try {
    const url = new URL(referer);
    return url.host === host ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

async function requestInfo(): Promise<RequestInfo> {
  const requestHeaders = await headers();
  return {
    vercelRequestId: requestHeaders.get("x-vercel-id"),
    page: pageOf(requestHeaders.get("referer"), requestHeaders.get("host")),
  };
}

export async function requestInfoOrNone(): Promise<RequestInfo> {
  try {
    return await requestInfo();
  } catch (error) {
    unstable_rethrow(error);
    return { vercelRequestId: null, page: null };
  }
}

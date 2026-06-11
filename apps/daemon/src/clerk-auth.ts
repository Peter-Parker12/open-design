// Optional Clerk session-token verification for non-loopback deployments
// (e.g. a VPS reachable over the internet). This is a complement to
// OD_API_TOKEN, not a replacement: OD_API_TOKEN remains the automation /
// CLI-over-network path, while Clerk gates browser sessions. Both are
// opt-in and the daemon behaves exactly as before when neither is set.
//
// apps/web mounts <ClerkGate> (apps/web/src/auth/ClerkGate.tsx) which, when
// NEXT_PUBLIC_OD_CLERK_PUBLISHABLE_KEY is configured at build time, blocks
// the app behind <SignedOut><SignIn/></SignedOut> and attaches the signed-in
// user's Clerk session token to same-origin /api/* requests as
// `Authorization: Bearer <token>`. verifyClerkBearerToken below is the
// server-side counterpart that validates that token.
import { verifyToken } from '@clerk/backend';

export function isClerkAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    Boolean((env.OD_CLERK_SECRET_KEY ?? '').trim()) &&
    Boolean((env.OD_CLERK_PUBLISHABLE_KEY ?? '').trim())
  );
}

export async function verifyClerkBearerToken(token: string, secretKey: string): Promise<boolean> {
  try {
    await verifyToken(token, { secretKey });
    return true;
  } catch {
    return false;
  }
}

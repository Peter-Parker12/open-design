'use client';

import { ClerkProvider, SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import { useEffect, type ReactNode } from 'react';
import styles from './ClerkGate.module.css';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_OD_CLERK_PUBLISHABLE_KEY ?? '';

// Mirrors apps/web/src/analytics/provider.tsx's isSameOriginApiCall: only
// same-origin /api/* calls get the Authorization header, so the Clerk
// session token never leaks to third-party requests.
function isSameOriginApiCall(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  if (url.startsWith('/api/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

// Attaches the signed-in user's Clerk session token to same-origin /api/*
// requests so apps/daemon's verifyClerkBearerToken (clerk-auth.ts) can
// authorize them when OD_CLERK_SECRET_KEY/OD_CLERK_PUBLISHABLE_KEY are set.
function ClerkApiAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!isSameOriginApiCall(url)) return original(input, init);
      const token = await getToken();
      if (!token) return original(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${token}`);
      return original(input, { ...(init ?? {}), headers });
    };
    return () => {
      window.fetch = original;
    };
  }, [getToken]);

  return null;
}

// Login wall for VPS deployments: when NEXT_PUBLIC_OD_CLERK_PUBLISHABLE_KEY
// is configured at build time, unauthenticated visitors see only the Clerk
// sign-in screen. Self-hosters who leave it unset get the app unchanged.
export function ClerkGate({ children }: { children: ReactNode }) {
  if (!PUBLISHABLE_KEY) return <>{children}</>;

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <SignedIn>
        <ClerkApiAuthBridge />
        {children}
      </SignedIn>
      <SignedOut>
        <div className={styles.signInScreen}>
          <SignIn routing="virtual" />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}

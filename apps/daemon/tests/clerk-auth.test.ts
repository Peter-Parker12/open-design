// Optional Clerk login wall (apps/daemon/src/clerk-auth.ts).
//
// Mirrors apps/daemon/tests/api-token-guard.test.ts: OD_CLERK_SECRET_KEY +
// OD_CLERK_PUBLISHABLE_KEY are an alternative to OD_API_TOKEN for the
// bound-host safety floor in startServer.

import type http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isClerkAuthConfigured, verifyClerkBearerToken } from '../src/clerk-auth.js';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '@clerk/backend';
import { startServer } from '../src/server.js';

const mockVerifyToken = vi.mocked(verifyToken);

describe('isClerkAuthConfigured', () => {
  it('is false when neither key is set', () => {
    expect(isClerkAuthConfigured({})).toBe(false);
  });

  it('is false when only one key is set', () => {
    expect(isClerkAuthConfigured({ OD_CLERK_SECRET_KEY: 'sk_test' })).toBe(false);
    expect(isClerkAuthConfigured({ OD_CLERK_PUBLISHABLE_KEY: 'pk_test' })).toBe(false);
  });

  it('treats whitespace-only values as unset', () => {
    expect(
      isClerkAuthConfigured({ OD_CLERK_SECRET_KEY: '  ', OD_CLERK_PUBLISHABLE_KEY: 'pk_test' }),
    ).toBe(false);
  });

  it('is true when both keys are set', () => {
    expect(
      isClerkAuthConfigured({
        OD_CLERK_SECRET_KEY: 'sk_test',
        OD_CLERK_PUBLISHABLE_KEY: 'pk_test',
      }),
    ).toBe(true);
  });
});

describe('verifyClerkBearerToken', () => {
  afterEach(() => {
    mockVerifyToken.mockReset();
  });

  it('returns true when verifyToken resolves', async () => {
    mockVerifyToken.mockResolvedValue({} as never);
    await expect(verifyClerkBearerToken('valid-token', 'sk_test')).resolves.toBe(true);
    expect(mockVerifyToken).toHaveBeenCalledWith('valid-token', { secretKey: 'sk_test' });
  });

  it('returns false when verifyToken rejects', async () => {
    mockVerifyToken.mockRejectedValue(new Error('invalid'));
    await expect(verifyClerkBearerToken('bad-token', 'sk_test')).resolves.toBe(false);
  });
});

describe('bound-host guard with Clerk configured', () => {
  const PREVIOUS_TOKEN = process.env.OD_API_TOKEN;
  const PREVIOUS_SECRET = process.env.OD_CLERK_SECRET_KEY;
  const PREVIOUS_PUBLISHABLE = process.env.OD_CLERK_PUBLISHABLE_KEY;

  let server: http.Server | undefined;
  let shutdown: (() => Promise<void> | void) | undefined;

  afterEach(async () => {
    if (shutdown) await Promise.resolve(shutdown());
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    shutdown = undefined;
    if (PREVIOUS_TOKEN === undefined) delete process.env.OD_API_TOKEN;
    else process.env.OD_API_TOKEN = PREVIOUS_TOKEN;
    if (PREVIOUS_SECRET === undefined) delete process.env.OD_CLERK_SECRET_KEY;
    else process.env.OD_CLERK_SECRET_KEY = PREVIOUS_SECRET;
    if (PREVIOUS_PUBLISHABLE === undefined) delete process.env.OD_CLERK_PUBLISHABLE_KEY;
    else process.env.OD_CLERK_PUBLISHABLE_KEY = PREVIOUS_PUBLISHABLE;
  });

  it('starts on a non-loopback host without OD_API_TOKEN when Clerk is configured', async () => {
    delete process.env.OD_API_TOKEN;
    process.env.OD_CLERK_SECRET_KEY = 'sk_test_secret';
    process.env.OD_CLERK_PUBLISHABLE_KEY = 'pk_test_publishable';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    expect(started.url).toMatch(/^http:\/\//);
  });

  it('still refuses a non-loopback host when neither OD_API_TOKEN nor Clerk is configured', async () => {
    delete process.env.OD_API_TOKEN;
    delete process.env.OD_CLERK_SECRET_KEY;
    delete process.env.OD_CLERK_PUBLISHABLE_KEY;
    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true })).rejects.toThrow(
      /OD_API_TOKEN or OD_CLERK_SECRET_KEY/,
    );
  });
});

import { describe, expect, test } from 'vitest';

import { collectReferencedEnvVarNames, pickReferencedSecretEnvVars } from './openclawSecretEnv';

describe('collectReferencedEnvVarNames', () => {
  test('extracts OpenClaw env placeholders from serialized config', () => {
    const refs = collectReferencedEnvVarNames({
      models: {
        providers: {
          openai: { apiKey: '${LOBSTER_APIKEY_OPENAI}' },
          server: { apiKey: '${LOBSTER_PROXY_TOKEN}' },
        },
      },
      ignored: '${not-uppercase}',
    });

    expect([...refs].sort()).toEqual([
      'LOBSTER_APIKEY_OPENAI',
      'LOBSTER_PROXY_TOKEN',
    ]);
  });
});

describe('pickReferencedSecretEnvVars', () => {
  test('ignores dynamic secrets that are not referenced by openclaw config', () => {
    const referenced = new Set(['LOBSTER_PROXY_TOKEN']);

    const before = pickReferencedSecretEnvVars({
      LOBSTER_APIKEY_SERVER: 'old-access-token',
      LOBSTER_PROXY_TOKEN: 'stable-proxy-token',
    }, referenced);
    const after = pickReferencedSecretEnvVars({
      LOBSTER_APIKEY_SERVER: 'new-access-token',
      LOBSTER_PROXY_TOKEN: 'stable-proxy-token',
    }, referenced);

    expect(before).toEqual({ LOBSTER_PROXY_TOKEN: 'stable-proxy-token' });
    expect(JSON.stringify(before)).toBe(JSON.stringify(after));
  });

  test('keeps referenced secret changes visible for restart decisions', () => {
    const referenced = new Set(['LOBSTER_APIKEY_OPENAI']);

    const before = pickReferencedSecretEnvVars({
      LOBSTER_APIKEY_OPENAI: 'sk-old',
      LOBSTER_APIKEY_SERVER: 'old-access-token',
    }, referenced);
    const after = pickReferencedSecretEnvVars({
      LOBSTER_APIKEY_OPENAI: 'sk-new',
      LOBSTER_APIKEY_SERVER: 'new-access-token',
    }, referenced);

    expect(JSON.stringify(before)).not.toBe(JSON.stringify(after));
  });
});

import { describe, expect, test } from 'vitest';

import {
  authQuotaGateStateFromQuota,
  AuthSubscriptionStatus,
  createDefaultAuthQuotaGateState,
  normalizeAuthQuota,
} from './authQuota';

const labels = {
  freePlanName: 'Free',
  standardPlanName: 'Standard',
};

describe('normalizeAuthQuota', () => {
  test('treats boost or invitation credits as media generation entitlement for free users', () => {
    const quota = normalizeAuthQuota({
      planName: 'Free',
      subscriptionStatus: AuthSubscriptionStatus.Free,
      freeCreditsTotal: 300,
      freeCreditsUsed: 300,
      hasPaidCredits: true,
    }, labels);

    expect(quota).toEqual(expect.objectContaining({
      subscriptionStatus: AuthSubscriptionStatus.Free,
      creditsRemaining: 0,
      hasPaidCredits: true,
    }));
    expect(authQuotaGateStateFromQuota(quota)).toEqual({
      subscriptionStatus: AuthSubscriptionStatus.Free,
      mediaGenerationEntitled: true,
    });
  });

  test('treats an active subscription as paid entitlement even without hasPaidCredits in the raw response', () => {
    const quota = normalizeAuthQuota({
      planName: 'Standard',
      subscriptionStatus: AuthSubscriptionStatus.Active,
      monthlyCreditsLimit: 5000,
      monthlyCreditsUsed: 100,
    }, labels);

    expect(quota).toEqual(expect.objectContaining({
      subscriptionStatus: AuthSubscriptionStatus.Active,
      creditsRemaining: 4900,
      hasPaidCredits: true,
    }));
    expect(authQuotaGateStateFromQuota(quota).mediaGenerationEntitled).toBe(true);
  });

  test('fills hasPaidCredits for already-normalized quota responses', () => {
    const quota = normalizeAuthQuota({
      planName: 'Free',
      subscriptionStatus: AuthSubscriptionStatus.Free,
      creditsLimit: 300,
      creditsUsed: 300,
      hasPaidCredits: true,
    }, labels);

    expect(quota).toEqual(expect.objectContaining({
      creditsRemaining: 0,
      hasPaidCredits: true,
    }));
    expect(authQuotaGateStateFromQuota(quota).mediaGenerationEntitled).toBe(true);
  });

  test('uses a non-entitled free state as the default reset state', () => {
    expect(createDefaultAuthQuotaGateState()).toEqual({
      subscriptionStatus: AuthSubscriptionStatus.Free,
      mediaGenerationEntitled: false,
    });
  });
});

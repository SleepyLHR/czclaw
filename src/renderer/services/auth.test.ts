import { ProviderName } from '@shared/providers';
import { describe, expect, test } from 'vitest';

import {
  mapPricingCatalogTextModelsToServerModels,
  mapPricingCatalogToPublicServerModels,
} from './auth';

describe('pricing catalog model mapping', () => {
  test('maps public text models to locked server models', () => {
    const [model] = mapPricingCatalogTextModelsToServerModels([
      {
        modelId: 'qwen3.7-plus',
        modelName: 'Qwen3.7-Plus',
        provider: 'czclaw',
        providerLabel: 'czclaw Plan',
        description: 'Strong multimodal model',
        supportsImage: true,
        supportsThinking: true,
        contextWindow: 1_000_000,
        costMultiplier: 1.6,
      },
    ]);

    expect(model).toMatchObject({
      id: 'qwen3.7-plus',
      name: 'Qwen3.7-Plus',
      provider: 'czclaw Plan',
      providerKey: ProviderName.LobsteraiServer,
      isServerModel: true,
      accessible: false,
      description: 'Strong multimodal model',
      supportsImage: true,
      supportsThinking: true,
      contextWindow: 1_000_000,
      costMultiplier: 1.6,
    });
  });

  test('maps only textModels from the pricing catalog', () => {
    const models = mapPricingCatalogToPublicServerModels({
      textModels: [
        {
          modelId: 'MiniMax-M3',
          modelName: 'MiniMax M3',
        },
      ],
      imageModels: [
        {
          modelId: 'image-01',
          modelName: 'MiniMax-Image-01',
        },
      ],
      videoModels: [
        {
          modelId: 'happyhorse-1.0-i2v',
          modelName: 'HappyHorse',
        },
      ],
    });

    expect(models.map(model => model.id)).toEqual(['MiniMax-M3']);
    expect(models[0].accessible).toBe(false);
  });
});

import { z } from 'zod';
import { typeDefinedConfig } from './utils';
import { SYM_FIXER_DEFAULT } from '@lib/symbols';
import {
    DEFAULT_QUEUE_CONFIG,
    migrateQueueConfig,
    QueueConfigSchema,
    QueueRuleSchema,
    QueueSlotPoolSchema,
} from '@shared/queueTypes';

const enabled = typeDefinedConfig({
    name: 'Queue Enabled',
    default: DEFAULT_QUEUE_CONFIG.enabled,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const rules = typeDefinedConfig({
    name: 'Queue Rules',
    default: DEFAULT_QUEUE_CONFIG.rules,
    validator: z.array(QueueRuleSchema),
    fixer: (input: unknown) => {
        const parsed = z.array(QueueRuleSchema).safeParse(input);
        return parsed.success ? parsed.data : DEFAULT_QUEUE_CONFIG.rules;
    },
});

const pools = typeDefinedConfig({
    name: 'Queue Slot Pools',
    default: DEFAULT_QUEUE_CONFIG.pools,
    validator: z.array(QueueSlotPoolSchema),
    fixer: (input: unknown) => migrateQueueConfig({ pools: input }).pools,
});

const maxConcurrentDeferrals = typeDefinedConfig({
    name: 'Queue Max Users In Queue',
    default: DEFAULT_QUEUE_CONFIG.maxConcurrentDeferrals,
    validator: QueueConfigSchema.shape.maxConcurrentDeferrals,
    fixer: SYM_FIXER_DEFAULT,
});

export default {
    enabled,
    rules,
    pools,
    maxConcurrentDeferrals,
} as const;

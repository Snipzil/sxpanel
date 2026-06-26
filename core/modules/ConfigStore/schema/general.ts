import { z } from 'zod';
import { typeDefinedConfig } from './utils';
import { SYM_FIXER_DEFAULT } from '@lib/symbols';
import localeMap from '@shared/localeMap';

const serverName = typeDefinedConfig({
    name: 'Server Name',
    default: 'change-me',
    validator: z.string().min(1).max(18),
    fixer: SYM_FIXER_DEFAULT,
});

const language = typeDefinedConfig({
    name: 'Language',
    default: 'en',
    validator: z
        .string()
        .min(2)
        .refine(
            (value) => value === 'custom' || localeMap[value] !== undefined,
            (value) => ({ message: `Invalid language code \`${value ?? '??'}\`.` }),
        ),
    fixer: SYM_FIXER_DEFAULT,
});

export default {
    serverName,
    language,
    hideFxsUpdateNotification: typeDefinedConfig({
        name: 'Hide FxServer Update Notification',
        default: false,
        validator: z.boolean(),
        fixer: SYM_FIXER_DEFAULT,
    }),
    allowSelfIdentifierEdit: typeDefinedConfig({
        name: 'Allow Self Identifier Edit',
        default: false,
        validator: z.boolean(),
        fixer: SYM_FIXER_DEFAULT,
    }),
    requireAdminTwoFactor: typeDefinedConfig({
        name: 'Require Two-Factor Authentication',
        default: false,
        validator: z.boolean(),
        fixer: SYM_FIXER_DEFAULT,
    }),
    enableTelemetry: typeDefinedConfig({
        name: 'Enable Anonymous Telemetry',
        default: true,
        validator: z.boolean(),
        fixer: SYM_FIXER_DEFAULT,
    }),
} as const;

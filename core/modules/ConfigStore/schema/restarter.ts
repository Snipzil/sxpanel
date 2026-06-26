import { z } from 'zod';
import { typeDefinedConfig } from './utils';
import { SYM_FIXER_DEFAULT } from '@lib/symbols';
import { parseSchedule, regexHoursMinutes } from '@lib/misc';

export const polishScheduleTimesArray = (input: string[]) => {
    return parseSchedule(input).valid.map((v) => v.string);
};

const schedule = typeDefinedConfig({
    name: 'Restart Schedule',
    default: [],
    validator: z.string().regex(regexHoursMinutes).array().transform(polishScheduleTimesArray),
    fixer: (input: any) => {
        if (!Array.isArray(input)) return [];
        return polishScheduleTimesArray(input);
    },
});

const bootGracePeriod = typeDefinedConfig({
    name: 'Boot Grace Period',
    default: 45,
    validator: z.number().int().min(15),
    fixer: SYM_FIXER_DEFAULT,
});

const resourceStartingTolerance = typeDefinedConfig({
    name: 'Resource Starting Tolerance',
    default: 90,
    validator: z.number().int().min(30),
    fixer: SYM_FIXER_DEFAULT,
});

const intervalHours = typeDefinedConfig({
    name: 'Restart Interval (Hours)',
    default: 0,
    validator: z.number().int().min(0),
    fixer: SYM_FIXER_DEFAULT,
});

const disableHealthCheck = typeDefinedConfig({
    name: 'Disable HTTP Health Check',
    default: false,
    validator: z.coerce.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const httpPlayerlistHost = typeDefinedConfig({
    name: 'HTTP Playerlist Host Override',
    default: '',
    validator: z.string().max(128),
    fixer: SYM_FIXER_DEFAULT,
});

export default {
    schedule,
    bootGracePeriod,
    resourceStartingTolerance,
    intervalHours,
    disableHealthCheck,
    httpPlayerlistHost,
} as const;

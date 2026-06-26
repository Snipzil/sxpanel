import type { ServerLogEvent } from '@/pages/ServerLog/serverLogTypes';

/**
 * Display-item grouping shared by ServerLogPageV1 (original behavior snapshot)
 * and ServerLogPage (redesign). Groups consecutive join or leave events
 * that happen within a 10 second window into a single collapsible row.
 */
export type DisplayItem =
    | { kind: 'single'; event: ServerLogEvent }
    | { kind: 'group'; type: 'join' | 'leave'; events: ServerLogEvent[] };

const JOIN_TYPES = new Set(['playerJoining', 'playerJoinDenied']);
const LEAVE_TYPES = new Set(['playerDropped']);
const GROUP_WINDOW_MS = 10_000;

export const groupEvents = (events: ServerLogEvent[]): DisplayItem[] => {
    const items: DisplayItem[] = [];
    let i = 0;

    while (i < events.length) {
        const event = events[i];
        const isJoin = JOIN_TYPES.has(event.type);
        const isLeave = LEAVE_TYPES.has(event.type);

        if (isJoin || isLeave) {
            const groupType = isJoin ? 'join' : 'leave';
            const matchTypes = isJoin ? JOIN_TYPES : LEAVE_TYPES;
            const group: ServerLogEvent[] = [event];
            let j = i + 1;
            while (j < events.length && matchTypes.has(events[j].type) && events[j].ts - event.ts < GROUP_WINDOW_MS) {
                group.push(events[j]);
                j++;
            }
            if (group.length >= 3) {
                items.push({ kind: 'group', type: groupType, events: group });
            } else {
                for (const e of group) {
                    items.push({ kind: 'single', event: e });
                }
            }
            i = j;
        } else {
            items.push({ kind: 'single', event });
            i++;
        }
    }

    return items;
};

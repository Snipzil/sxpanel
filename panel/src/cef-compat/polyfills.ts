/**
 * Runtime JavaScript polyfills for APIs missing in FiveM CEF (~Chrome 103).
 * @see FIVEM_CEF_CHROME_VERSION in ./constants.ts
 */

export function installCefPolyfills(): void {
    const promiseCtor = Promise as PromiseConstructor & {
        withResolvers?: <T>() => {
            promise: Promise<T>;
            resolve: (value: T | PromiseLike<T>) => void;
            reject: (reason?: unknown) => void;
        };
    };

    if (!('withResolvers' in Promise)) {
        promiseCtor.withResolvers = function withResolvers<T>() {
            let resolve!: (value: T | PromiseLike<T>) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        };
    }

    const objectCtor = Object as ObjectConstructor & {
        groupBy?: <K extends PropertyKey, T>(
            items: Iterable<T>,
            keySelector: (item: T, index: number) => K,
        ) => Partial<Record<K, T[]>>;
    };

    if (!('groupBy' in Object)) {
        objectCtor.groupBy = function groupBy<K extends PropertyKey, T>(
            items: Iterable<T>,
            keySelector: (item: T, index: number) => K,
        ): Partial<Record<K, T[]>> {
            const result = Object.create(null) as Partial<Record<K, T[]>>;
            let index = 0;
            for (const item of items) {
                const key = keySelector(item, index++);
                (result[key] ??= []).push(item);
            }
            return result;
        };
    }

    const arrayProto = Array.prototype as Array<unknown> & {
        toSorted?: <T>(compareFn?: (a: T, b: T) => number) => T[];
        toReversed?: <T>() => T[];
        toSpliced?: <T>(start: number, deleteCount?: number, ...items: T[]) => T[];
        with?: <T>(index: number, value: T) => T[];
    };

    if (!arrayProto.toSorted) {
        arrayProto.toSorted = function toSorted<T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
            return [...this].sort(compareFn);
        };
    }

    if (!arrayProto.toReversed) {
        arrayProto.toReversed = function toReversed<T>(this: T[]): T[] {
            return [...this].reverse();
        };
    }

    if (!arrayProto.toSpliced) {
        arrayProto.toSpliced = function toSpliced<T>(
            this: T[],
            start: number,
            deleteCount?: number,
            ...items: T[]
        ): T[] {
            const copy = [...this];
            copy.splice(start, deleteCount ?? copy.length - start, ...items);
            return copy;
        };
    }

    if (!arrayProto.with) {
        arrayProto.with = function withIndex<T>(this: T[], index: number, value: T): T[] {
            const copy = [...this];
            copy[index] = value;
            return copy;
        };
    }
}

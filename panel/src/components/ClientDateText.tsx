import { useEffect, useRef, useState } from 'react';

type ClientDateTextProps = {
    timestamp: number | null | undefined;
    formatter: (date: Date) => string;
    fallback?: string;
    className?: string;
    as?: 'span' | 'div';
};

export const ClientDateText = ({
    timestamp,
    formatter,
    fallback = '',
    className,
    as = 'span',
}: ClientDateTextProps) => {
    const [text, setText] = useState('');

    // Hold the latest formatter in a ref so we can read it from the effect
    // without subscribing to its identity. Callers typically pass an inline
    // arrow function, which would otherwise re-trigger the effect every render.
    const formatterRef = useRef(formatter);
    formatterRef.current = formatter;

    useEffect(() => {
        if (timestamp === null || timestamp === undefined) {
            setText(fallback);
            return;
        }

        setText(formatterRef.current(new Date(timestamp)));
    }, [timestamp, fallback]);

    const Component = as;

    return (
        <Component className={className} suppressHydrationWarning>
            {text}
        </Component>
    );
};

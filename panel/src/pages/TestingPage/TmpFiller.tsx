export default function TmpFiller({ count = 96, maxWidth = 48 }: { count?: number; maxWidth?: number }) {
    const fillerLines = Array.from({ length: count }, (_, lineNumber) => {
        const text = '='.repeat(lineNumber % maxWidth);
        const hue = Math.floor((lineNumber / 50) * 180);

        return (
            <div
                key={`${count}-${maxWidth}-${lineNumber}`}
                style={{ backgroundColor: `hsl(${hue}deg 75% 65%)`, height: '1.5rem' }}
            >
                {text}
            </div>
        );
    });

    return <div className="mx-auto bg-emerald-300/75 text-center break-all text-black">{fillerLines}</div>;
}

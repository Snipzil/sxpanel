import { describe, expect, it } from 'vitest';
import { transformCssForCef } from './cefCssCompat';

describe('transformCssForCef', () => {
    it('hoists @supports color-mix blocks and rewrites hsl var opacity utilities', () => {
        const input = `
.bg-accent\\/10{background-color:hsl(var(--accent))}
@supports (color:color-mix(in lab, red, red)){
.bg-accent\\/10{background-color:color-mix(in oklab,hsl(var(--accent)) 10%,transparent)}
}`;
        const out = transformCssForCef(input);
        expect(out).not.toContain('color-mix(');
        expect(out).not.toContain('@supports');
        expect(out).toContain('hsl(var(--accent) / calc(10 / 100))');
    });

    it('rewrites palette var color-mix using hex from :root', () => {
        const input = `
:root{--color-red-500:#ef4444}
.text-red-500\\/75{color:color-mix(in oklab,var(--color-red-500) 75%,transparent)}
@supports (color:color-mix(in lab, red, red)){
.text-red-500\\/75{color:color-mix(in oklab,var(--color-red-500) 75%,transparent)}
}`;
        const out = transformCssForCef(input);
        expect(out).not.toContain('color-mix(');
        expect(out).toContain('rgba(239,68,68,0.75)');
    });

    it('hoists multi-rule @supports color-mix blocks without corrupting trailing CSS', () => {
        const input = `
.keep{opacity:1}
@supports (color:color-mix(in lab, red, red)){.bg-accent\\/10{background-color:color-mix(in oklab,hsl(var(--accent)) 10%,transparent)}.bg-accent\\/20{background-color:color-mix(in oklab,hsl(var(--accent)) 20%,transparent)}}
.flex{display:flex}`;
        const out = transformCssForCef(input);
        expect(out).not.toContain('@supports');
        expect(out).not.toContain('color-mix(');
        expect(out).toContain('.flex{display:flex}');
        expect(out).toContain('hsl(var(--accent) / calc(10 / 100))');
        expect(out).toContain('hsl(var(--accent) / calc(20 / 100))');
    });

    it('leaves non-opacity hsl rules unchanged', () => {
        const input = `.bg-accent{background-color:hsl(var(--accent))}`;
        expect(transformCssForCef(input)).toBe(input);
    });
});

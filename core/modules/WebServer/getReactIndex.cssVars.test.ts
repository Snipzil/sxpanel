/**
 * Unit tests for the panelVars CSS custom-property sanitization logic in getReactIndex.ts.
 * The regex constants are imported from cssVarSanitize.ts — the single source of truth
 * shared with getReactIndex.ts — so test coverage stays in sync with production code.
 */
import { describe, it, expect } from 'vitest';
import { PANEL_VAR_NAME_RE, PANEL_VAR_VALUE_RE, PANEL_VAR_FORBIDDEN_RE } from './cssVarSanitize';

function sanitize(panelVars: Record<string, unknown>): string[] {
    const cssDeclarations: string[] = [];
    for (const [name, value] of Object.entries(panelVars)) {
        if (typeof name !== 'string' || typeof value !== 'string') continue;
        const safeName = name.trim();
        if (!PANEL_VAR_NAME_RE.test(safeName)) continue;
        const safeValue = value.trim();
        if (!safeValue) continue;
        if (PANEL_VAR_FORBIDDEN_RE.test(safeValue)) continue;
        if (/[;<>{}]/.test(safeValue)) continue;
        if (!PANEL_VAR_VALUE_RE.test(safeValue)) continue;
        cssDeclarations.push(`${safeName}: ${safeValue};`);
    }
    return cssDeclarations;
}

describe('panelVars CSS sanitization', () => {
    // -------------------------------------------------------------------------
    // Valid inputs
    // -------------------------------------------------------------------------
    describe('valid declarations', () => {
        it('accepts a simple color hex', () => {
            expect(sanitize({ '--color-primary': '#ff0000' })).toEqual(['--color-primary: #ff0000;']);
        });

        it('accepts numeric value with unit', () => {
            expect(sanitize({ '--spacing-lg': '16px' })).toEqual(['--spacing-lg: 16px;']);
        });

        it('accepts rgb() color', () => {
            expect(sanitize({ '--bg': 'rgb(255, 128, 0)' })).toEqual(['--bg: rgb(255, 128, 0);']);
        });

        it('accepts hsl() color', () => {
            expect(sanitize({ '--hsl': 'hsl(120, 50%, 50%)' })).toEqual(['--hsl: hsl(120, 50%, 50%);']);
        });

        it('trims surrounding whitespace from both name and value', () => {
            expect(sanitize({ '  --my-var  ': '  red  ' })).toEqual(['--my-var: red;']);
        });

        it('accepts mixed-case var names (case-insensitive NAME_RE)', () => {
            expect(sanitize({ '--MyVar-A1': 'blue' })).toEqual(['--MyVar-A1: blue;']);
        });

        it('accepts allowed punctuation: spaces, hashes, parens, commas, percent, slash, plus, minus, asterisk', () => {
            expect(sanitize({ '--v': '10px / 2 + 3% * 4' })).toEqual(['--v: 10px / 2 + 3% * 4;']);
        });

        it('accepts underscore in value via whitelist', () => {
            // underscore IS in VALUE_RE ([a-zA-Z0-9 #().,%/_+\-*]), so foo_bar is valid
            expect(sanitize({ '--v': 'foo_bar' })).toEqual(['--v: foo_bar;']);
        });

        it('accepts a value with a dot (e.g. 1.5rem)', () => {
            expect(sanitize({ '--size': '1.5rem' })).toEqual(['--size: 1.5rem;']);
        });
    });

    // -------------------------------------------------------------------------
    // Invalid names
    // -------------------------------------------------------------------------
    describe('NAME_RE rejects invalid property names', () => {
        it('rejects names not starting with --', () => {
            expect(sanitize({ color: 'red' })).toEqual([]);
        });

        it('rejects names with spaces', () => {
            expect(sanitize({ '-- bad name': 'red' })).toEqual([]);
        });

        it('rejects names with special characters', () => {
            expect(sanitize({ '--var!': 'red' })).toEqual([]);
        });

        it('rejects empty name', () => {
            expect(sanitize({ '': 'red' })).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // Non-string inputs
    // -------------------------------------------------------------------------
    describe('non-string inputs are ignored', () => {
        it('ignores numeric value', () => {
            expect(sanitize({ '--v': 42 as any })).toEqual([]);
        });

        it('ignores null value', () => {
            expect(sanitize({ '--v': null as any })).toEqual([]);
        });

        it('ignores boolean value', () => {
            expect(sanitize({ '--v': true as any })).toEqual([]);
        });

        it('ignores object value', () => {
            expect(sanitize({ '--v': {} as any })).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // Empty / whitespace-only values
    // -------------------------------------------------------------------------
    describe('empty / whitespace-only values', () => {
        it('rejects empty string value', () => {
            expect(sanitize({ '--v': '' })).toEqual([]);
        });

        it('rejects whitespace-only value', () => {
            expect(sanitize({ '--v': '   ' })).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // FORBIDDEN_RE patterns
    // -------------------------------------------------------------------------
    describe('FORBIDDEN_RE blocks injection patterns', () => {
        it('blocks url()', () => {
            expect(sanitize({ '--v': 'url(https://evil.com)' })).toEqual([]);
        });

        it('blocks url() with whitespace', () => {
            expect(sanitize({ '--v': 'url ( evil )' })).toEqual([]);
        });

        it('blocks @import', () => {
            expect(sanitize({ '--v': '@import "evil.css"' })).toEqual([]);
        });

        it('blocks @charset', () => {
            expect(sanitize({ '--v': '@charset "UTF-8"' })).toEqual([]);
        });

        it('blocks arbitrary @-rules', () => {
            expect(sanitize({ '--v': '@keyframes foo' })).toEqual([]);
        });

        it('blocks expression()', () => {
            expect(sanitize({ '--v': 'expression(alert(1))' })).toEqual([]);
        });

        it('blocks expression() with whitespace', () => {
            expect(sanitize({ '--v': 'expression ( 1 )' })).toEqual([]);
        });

        it('blocks -moz-binding', () => {
            expect(sanitize({ '--v': '-moz-binding: url(x.xml)' })).toEqual([]);
        });

        it('blocks behavior:', () => {
            expect(sanitize({ '--v': 'behavior: url(x.htc)' })).toEqual([]);
        });

        it('blocks javascript: scheme', () => {
            expect(sanitize({ '--v': 'javascript:alert(1)' })).toEqual([]);
        });

        it('blocks data: scheme', () => {
            expect(sanitize({ '--v': 'data:text/html,<h1>hi</h1>' })).toEqual([]);
        });

        it('blocks CSS unicode escapes (\\26)', () => {
            expect(sanitize({ '--v': '\\26 script' })).toEqual([]);
        });

        it('blocks CSS hex escapes (\\41)', () => {
            expect(sanitize({ '--v': '\\41 lert' })).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // Rule-injection characters
    // -------------------------------------------------------------------------
    describe('rule-injection characters are blocked by secondary check', () => {
        it('blocks semicolon', () => {
            expect(sanitize({ '--v': 'red; color: blue' })).toEqual([]);
        });

        it('blocks angle bracket <', () => {
            expect(sanitize({ '--v': '<script>' })).toEqual([]);
        });

        it('blocks angle bracket >', () => {
            expect(sanitize({ '--v': 'a>b' })).toEqual([]);
        });

        it('blocks opening brace', () => {
            expect(sanitize({ '--v': 'a{b: c}' })).toEqual([]);
        });

        it('blocks closing brace', () => {
            expect(sanitize({ '--v': 'a}b' })).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // VALUE_RE whitelist boundary checks
    // -------------------------------------------------------------------------
    describe('VALUE_RE whitelist boundary checks', () => {
        it('rejects double-quote', () => {
            expect(sanitize({ '--v': '"red"' })).toEqual([]);
        });

        it('rejects single-quote', () => {
            expect(sanitize({ '--v': "'red'" })).toEqual([]);
        });

        it('rejects backslash (not a CSS escape sequence)', () => {
            // only digits follow \\ for FORBIDDEN_RE; a lone backslash still fails VALUE_RE
            expect(sanitize({ '--v': 'a\\b' })).toEqual([]);
        });

        it('rejects colon', () => {
            expect(sanitize({ '--v': 'a:b' })).toEqual([]);
        });

        it('rejects exclamation mark', () => {
            expect(sanitize({ '--v': '!important' })).toEqual([]);
        });

        it('accepts hash (color tokens)', () => {
            expect(sanitize({ '--v': '#abc123' })).toEqual(['--v: #abc123;']);
        });

        it('accepts parentheses (function values)', () => {
            expect(sanitize({ '--v': 'calc(10px)' })).toEqual(['--v: calc(10px);']);
        });

        it('accepts comma (multi-value)', () => {
            expect(sanitize({ '--v': '1px, 2px' })).toEqual(['--v: 1px, 2px;']);
        });

        it('accepts percent', () => {
            expect(sanitize({ '--v': '50%' })).toEqual(['--v: 50%;']);
        });

        it('accepts forward slash (e.g. border-radius shorthand)', () => {
            expect(sanitize({ '--v': '10px / 20px' })).toEqual(['--v: 10px / 20px;']);
        });

        it('accepts plus', () => {
            expect(sanitize({ '--v': '1px + 2px' })).toEqual(['--v: 1px + 2px;']);
        });

        it('accepts minus (hyphen)', () => {
            expect(sanitize({ '--v': '-1px' })).toEqual(['--v: -1px;']);
        });

        it('accepts asterisk', () => {
            expect(sanitize({ '--v': '1px * 2' })).toEqual(['--v: 1px * 2;']);
        });
    });

    // -------------------------------------------------------------------------
    // Multiple entries: only safe ones pass through
    // -------------------------------------------------------------------------
    it('filters mixed valid/invalid entries and returns only safe declarations', () => {
        const result = sanitize({
            '--safe': '#fff',
            '--unsafe': 'url(evil)',
            '--also-safe': '16px',
            '--injection': 'red; display: none',
            '--numeric-value': 42 as any,
        });
        expect(result).toEqual(['--safe: #fff;', '--also-safe: 16px;']);
    });
});

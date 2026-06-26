import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            parser: tsparser,
        },
        plugins: {
            '@typescript-eslint': tseslint,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            // Classic hooks rules only. react-hooks v7 "recommended" adds React Compiler rules
            // that flag widespread pre-existing patterns; enable those when adopting the compiler.
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'react-hooks/set-state-in-effect': 'off',
            'react-hooks/refs': 'off',
            'react-hooks/immutability': 'off',
            'react-hooks/purity': 'off',
            'react-hooks/preserve-manual-memoization': 'off',
            'react-hooks/static-components': 'off',
            'react-hooks/incompatible-library': 'off',
            'no-unused-vars': ['warn', { args: 'none' }],
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-wrapper-object-types': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
    eslintConfigPrettier,
];

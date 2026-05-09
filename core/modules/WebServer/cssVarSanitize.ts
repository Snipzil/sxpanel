/**
 * Shared regex constants for CSS custom-property sanitization used in panelVars.
 * Single source of truth consumed by getReactIndex.ts and its unit tests.
 */

/** Valid CSS custom-property name: must start with -- and contain only [a-z0-9-] (case-insensitive). */
export const PANEL_VAR_NAME_RE = /^--[a-z0-9-]+$/i;

/**
 * Conservative value whitelist: alphanumerics plus common punctuation used in
 * CSS color/length tokens.  Quotes are intentionally excluded because we don't
 * escape them on the way out.
 */
export const PANEL_VAR_VALUE_RE = /^[a-zA-Z0-9 #().,%/_+\-*]+$/;

/**
 * Patterns that indicate an attempt to break out of a value or
 * exfiltrate/load external resources.
 */
export const PANEL_VAR_FORBIDDEN_RE =
    /url\s*\(|@import|@charset|@\w+|expression\s*\(|-moz-binding|behavior\s*:|javascript:|data:|\\[0-9a-fA-F]/i;

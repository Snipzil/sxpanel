/**
 * Generate OpenAPI 3.0 spec from shared Zod schemas.
 *
 * Usage: npx tsx scripts/generate-openapi.ts
 *
 * Outputs: docs/openapi.json
 *
 * This script registers the shared Zod schemas and known API routes to produce
 * an OpenAPI specification. As more schemas move to the shared/ workspace,
 * register them here to expand the generated documentation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI metadata support
extendZodWithOpenApi(z);

// ── Import shared schemas ──────────────────────────────────────────────
import {
    verifyPasswordBodySchema,
    addMasterPinBodySchema,
    addMasterCallbackBodySchema,
    addMasterSaveBodySchema,
    changePasswordBodySchema,
    changeIdentifiersBodySchema,
    totpConfirmBodySchema,
    totpVerifyBodySchema,
    totpDisableBodySchema,
    cfxreRedirectQuerySchema,
    cfxreCallbackBodySchema,
} from '../shared/authApiSchemas.js';

import {
    addLegacyBanBodySchema,
    revokeActionBodySchema,
    deleteActionBodySchema,
    changeBanDurationBodySchema,
} from '../shared/historyApiSchemas.js';

// ── Registry ───────────────────────────────────────────────────────────
const registry = new OpenAPIRegistry();

// ── Auth routes ────────────────────────────────────────────────────────
registry.registerPath({
    method: 'post',
    path: '/auth/password',
    summary: 'Verify login credentials',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: verifyPasswordBodySchema } } } },
    responses: { 200: { description: 'Auth result or 2FA prompt' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/addMaster/pin',
    summary: 'Start master account setup with PIN',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: addMasterPinBodySchema } } } },
    responses: { 200: { description: 'OAuth redirect URL or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/addMaster/callback',
    summary: 'Handle CitizenFX (Cfx.re) OAuth callback for master setup',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: addMasterCallbackBodySchema } } } },
    responses: { 200: { description: 'CitizenFX user data or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/addMaster/save',
    summary: 'Save master account credentials',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: addMasterSaveBodySchema } } } },
    responses: { 200: { description: 'Auth data or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/changePassword',
    summary: 'Change own password',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: changePasswordBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/changeIdentifiers',
    summary: 'Change own Cfx.re and Discord identifiers',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: changeIdentifiersBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

registry.registerPath({
    method: 'get',
    path: '/auth/cfxre/redirect',
    summary: 'Get CitizenFX (Cfx.re) OAuth redirect URL',
    tags: ['Authentication'],
    request: { query: cfxreRedirectQuerySchema },
    responses: { 200: { description: 'OAuth redirect URL or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/cfxre/callback',
    summary: 'Handle CitizenFX (Cfx.re) OAuth callback',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: cfxreCallbackBodySchema } } } },
    responses: { 200: { description: 'Auth data or error' } },
});

// ── TOTP routes ────────────────────────────────────────────────────────
registry.registerPath({
    method: 'post',
    path: '/auth/totp/confirm',
    summary: 'Confirm TOTP setup with initial code',
    tags: ['TOTP'],
    request: { body: { content: { 'application/json': { schema: totpConfirmBodySchema } } } },
    responses: { 200: { description: 'Success with backup codes, or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/totp/verify',
    summary: 'Verify TOTP code during login',
    tags: ['TOTP'],
    request: { body: { content: { 'application/json': { schema: totpVerifyBodySchema } } } },
    responses: { 200: { description: 'Auth data or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/auth/totp/disable',
    summary: 'Disable TOTP 2FA',
    tags: ['TOTP'],
    request: { body: { content: { 'application/json': { schema: totpDisableBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

// ── History action routes ──────────────────────────────────────────────
registry.registerPath({
    method: 'post',
    path: '/history/addLegacyBan',
    summary: 'Add a legacy ban by identifiers',
    tags: ['History'],
    request: { body: { content: { 'application/json': { schema: addLegacyBanBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/history/revoke',
    summary: 'Revoke a ban or warning',
    tags: ['History'],
    request: { body: { content: { 'application/json': { schema: revokeActionBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/history/delete',
    summary: 'Delete an action record',
    tags: ['History'],
    request: { body: { content: { 'application/json': { schema: deleteActionBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

registry.registerPath({
    method: 'post',
    path: '/history/changeDuration',
    summary: 'Change ban duration',
    tags: ['History'],
    request: { body: { content: { 'application/json': { schema: changeBanDurationBodySchema } } } },
    responses: { 200: { description: 'Success or error' } },
});

// ── Generate spec ──────────────────────────────────────────────────────
const generator = new OpenApiGeneratorV3(registry.definitions);
const spec = generator.generateDocument({
    openapi: '3.0.3',
    info: {
        title: 'sxPanel API',
        version: '0.1.0',
        description: 'Auto-generated API documentation for sxPanel. Covers routes with shared Zod validation schemas.',
        license: { name: 'MIT' },
    },
    servers: [{ url: 'http://localhost:40120', description: 'Default sxPanel server' }],
});

// ── Write output ───────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '..', 'docs', 'openapi.json');
fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`OpenAPI spec written to ${outPath}`);

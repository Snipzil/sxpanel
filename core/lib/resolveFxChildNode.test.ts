import { expect, it, suite } from 'vitest';
import { formatFxChildNodeResolutionDiagnostics } from './resolveFxChildNode';

suite('resolveFxChildNode', () => {
    it('formats a successful resolution', () => {
        const text = formatFxChildNodeResolutionDiagnostics({
            childExecPath: '/opt/cfx-server/ld-musl-x86_64.so.1',
            childExecArgvPrefix: ['--library-path', '/lib', '--', '/opt/node20/bin/node'],
            candidateCount: 3,
            candidateSample: ['/opt/node20/bin/node'],
            cfxRoot: '/opt/cfx-server',
            hostExecPath: '/opt/cfx-server/ld-musl-x86_64.so.1',
            resolvedChildLabel: '/opt/node20/bin/node',
            resolvedViaMuslLoader: true,
        });

        expect(text).toContain('Resolved Node child runtime: /opt/node20/bin/node');
        expect(text).toContain('via musl loader');
    });

    it('formats a failed resolution with a suggested env var', () => {
        const text = formatFxChildNodeResolutionDiagnostics({
            childExecArgvPrefix: [],
            candidateCount: 2,
            candidateSample: ['/missing/node', 'node'],
            cfxRoot: '/home/container/alpine/opt/cfx-server',
            hostExecPath: '/home/container/alpine/opt/cfx-server/ld-musl-x86_64.so.1',
            resolvedViaMuslLoader: false,
            suggestedBotNodePath: '/home/container/alpine/opt/cfx-server/citizen/scripting/v8/node20/bin/node',
        });

        expect(text).toContain('No executable Node binary found');
        expect(text).toContain(
            'SXPANEL_BOT_NODE_PATH=/home/container/alpine/opt/cfx-server/citizen/scripting/v8/node20/bin/node',
        );
    });
});

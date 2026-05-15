/**
 * fxPanel Addon — Starter Template (Panel UI)
 *
 * This file exports React components that are loaded by the panel at runtime.
 * React is available as a global (window.React) — do NOT bundle it.
 *
 * Component names here MUST match the "component" values in addon.json.
 *
 * For API calls, use the global `txAddonApi` helpers:
 *   - txAddonApi.getHeaders()  → { 'Content-Type': 'application/json', 'X-TxAdmin-CsrfToken': '...' }
 *   - txAddonApi.csrfToken     → current CSRF token
 *   - txAddonApi.socket.get()  → Socket.io instance
 */

/* global React, globalThis */
const { createElement: h, useState, useEffect, useCallback } = React;

const ADDON_ID = 'addon-starter-template';
const API_BASE = `/addons/${ADDON_ID}/api`;

// ── Helpers ──

function getHeaders() {
    return globalThis.txAddonApi?.getHeaders() ?? { 'Content-Type': 'application/json' };
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'same-origin',
        headers: getHeaders(),
        ...opts,
    });
    return res.json();
}

// ── StarterPage — Full page component ──

export function StarterPage() {
    const [greeting, setGreeting] = useState(null);
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [greetRes, notesRes] = await Promise.all([
                apiFetch('/greeting'),
                apiFetch('/notes'),
            ]);
            setGreeting(greetRes.message);
            setNotes(notesRes.notes || []);
        } catch (err) {
            console.error('Starter addon fetch error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Listen for real-time note updates via WebSocket
    useEffect(() => {
        const socketApi = globalThis.txAddonApi?.socket;
        if (!socketApi) return;
        const socket = socketApi.get();
        const eventName = `addon:${ADDON_ID}:notes:updated`;
        const handler = () => fetchData();
        socket.on(eventName, handler);
        return () => socket.off(eventName, handler);
    }, [fetchData]);

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        await apiFetch('/notes', {
            method: 'POST',
            body: JSON.stringify({ text: newNote }),
        });
        setNewNote('');
        fetchData();
    };

    const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
    const btnCls = 'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';

    return h('div', { className: 'p-6 space-y-6 max-w-2xl' },
        h('div', null,
            h('h1', { className: 'text-2xl font-bold text-foreground' }, 'Starter Template'),
            h('p', { className: 'mt-1 text-sm text-muted-foreground' },
                'This is a starter addon page. Customize it to build your own features.'),
        ),

        loading
            ? h('p', { className: 'text-muted-foreground' }, 'Loading...')
            : h('div', { className: 'space-y-4' },
                // Greeting card
                greeting && h('div', { className: 'rounded-lg border border-border bg-card p-4' },
                    h('p', { className: 'text-foreground' }, greeting),
                ),

                // Add note form
                h('div', { className: 'rounded-lg border border-border bg-card p-4 space-y-3' },
                    h('h2', { className: 'text-lg font-semibold text-foreground' }, 'Notes'),
                    h('div', { className: 'flex gap-2' },
                        h('input', {
                            type: 'text',
                            className: inputCls,
                            placeholder: 'Write a note...',
                            value: newNote,
                            onChange: (e) => setNewNote(e.target.value),
                            onKeyDown: (e) => e.key === 'Enter' && handleAddNote(),
                        }),
                        h('button', { className: btnCls, onClick: handleAddNote }, 'Add'),
                    ),
                    notes.length === 0
                        ? h('p', { className: 'text-sm text-muted-foreground' }, 'No notes yet.')
                        : h('ul', { className: 'space-y-2' },
                            notes.map((note, i) =>
                                h('li', { key: i, className: 'flex justify-between items-start rounded-md border border-border p-3 text-sm' },
                                    h('div', null,
                                        h('p', { className: 'text-foreground' }, note.text),
                                        h('p', { className: 'text-xs text-muted-foreground mt-1' },
                                            `By ${note.author} · ${new Date(note.createdAt).toLocaleString()}`),
                                    ),
                                ),
                            ),
                        ),
                ),
            ),
    );
}

// ── StarterWidget — Dashboard widget component ──

export function StarterWidget() {
    const [visits, setVisits] = useState(null);

    useEffect(() => {
        apiFetch('/greeting')
            .then((res) => {
                const match = res.message?.match(/(\d+) time/);
                setVisits(match ? parseInt(match[1]) : '?');
            })
            .catch(() => setVisits('?'));
    }, []);

    return h('div', { className: 'flex items-center gap-3 p-2' },
        h('div', { className: 'rounded-full bg-primary/10 p-2' },
            h('span', { className: 'text-lg' }, '✨'),
        ),
        h('div', null,
            h('p', { className: 'text-sm font-medium text-foreground' }, 'Starter Template'),
            h('p', { className: 'text-xs text-muted-foreground' },
                visits !== null ? `${visits} API queries` : 'Loading...'),
        ),
    );
}

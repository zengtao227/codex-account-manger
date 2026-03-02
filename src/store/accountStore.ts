import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account, DailyUsage } from '../types';

// ── Tauri invoke (graceful fallback for browser dev mode) ──────────────────
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<T>(cmd, args);
    } catch {
        // Running in browser (dev without Tauri), use mock
        console.warn(`[mock] tauri invoke: ${cmd}`, args);
        if (cmd === 'write_auth') return undefined as T;
        if (cmd === 'read_current_auth') return '' as T;
        if (cmd === 'auth_exists') return false as T;
        if (cmd === 'get_codex_dir') return '~/.codex' as T;
        return undefined as T;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    '#10B981', '#6366F1', '#F59E0B', '#EF4444',
    '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

function getRandomColor(): string {
    return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ── Store interface ────────────────────────────────────────────────────────
interface AccountStore {
    accounts: Account[];
    activeAccountId: string | null;
    usageHistory: Record<string, DailyUsage[]>;
    isLoading: boolean;
    error: string | null;

    addAccount: (alias: string, email?: string, authJson?: string) => Account;
    removeAccount: (id: string) => void;
    switchAccount: (id: string) => Promise<void>;
    updateAccountUsage: (id: string, fiveHourPercent: number, weeklyPercent: number) => void;
    renameAccount: (id: string, newAlias: string) => void;
    setError: (error: string | null) => void;
    recordUsage: (accountId: string) => void;
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useAccountStore = create<AccountStore>()(
    persist(
        (set, get) => ({
            accounts: [],
            activeAccountId: null,
            usageHistory: {},
            isLoading: false,
            error: null,

            addAccount: (alias: string, email?: string, authJson?: string) => {
                const initial = alias.charAt(0).toUpperCase();
                const newAccount: Account = {
                    id: generateId(),
                    alias,
                    email,
                    authJson,
                    avatarColor: getRandomColor(),
                    avatarInitial: initial,
                    addedAt: Date.now(),
                    isActive: false,
                    totalSessions: 0,
                    weeklyUsagePercent: 0,
                    fiveHourUsagePercent: 0,
                };
                set((state) => ({ accounts: [...state.accounts, newAccount] }));
                return newAccount;
            },

            removeAccount: (id: string) => {
                set((state) => ({
                    accounts: state.accounts.filter((a) => a.id !== id),
                    activeAccountId: state.activeAccountId === id ? null : state.activeAccountId,
                }));
            },

            switchAccount: async (id: string) => {
                set({ isLoading: true, error: null });
                try {
                    const target = get().accounts.find((a) => a.id === id);
                    if (!target) throw new Error('账户不存在');

                    // Write auth.json via Tauri Rust command
                    if (target.authJson) {
                        await tauriInvoke('write_auth', { content: target.authJson });
                    }

                    const prevActiveId = get().activeAccountId;

                    set((state) => ({
                        accounts: state.accounts.map((a) => ({
                            ...a,
                            isActive: a.id === id,
                            lastUsedAt: a.id === id ? Date.now() : a.lastUsedAt,
                            totalSessions: a.id === id ? a.totalSessions + 1 : a.totalSessions,
                        })),
                        activeAccountId: id,
                        isLoading: false,
                    }));

                    // Record usage for previous account
                    if (prevActiveId && prevActiveId !== id) {
                        get().recordUsage(prevActiveId);
                    }
                } catch (err) {
                    set({ isLoading: false, error: String(err) });
                    throw err;
                }
            },

            updateAccountUsage: (id: string, fiveHourPercent: number, weeklyPercent: number) => {
                set((state) => ({
                    accounts: state.accounts.map((a) =>
                        a.id === id
                            ? { ...a, fiveHourUsagePercent: fiveHourPercent, weeklyUsagePercent: weeklyPercent }
                            : a
                    ),
                }));
            },

            renameAccount: (id: string, newAlias: string) => {
                set((state) => ({
                    accounts: state.accounts.map((a) =>
                        a.id === id
                            ? { ...a, alias: newAlias, avatarInitial: newAlias.charAt(0).toUpperCase() }
                            : a
                    ),
                }));
            },

            setError: (error) => set({ error }),

            recordUsage: (accountId: string) => {
                const today = new Date().toISOString().split('T')[0];
                set((state) => {
                    const history = state.usageHistory[accountId] || [];
                    const todayEntry = history.find((d) => d.date === today);
                    const updatedHistory = todayEntry
                        ? history.map((d) =>
                            d.date === today
                                ? { ...d, sessions: d.sessions + 1, estimatedPercent: Math.min(100, d.estimatedPercent + 15) }
                                : d
                        )
                        : [...history, { date: today, sessions: 1, estimatedPercent: 15 }];

                    const sorted = updatedHistory
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .slice(0, 7)
                        .reverse();

                    return {
                        usageHistory: { ...state.usageHistory, [accountId]: sorted },
                    };
                });
            },
        }),
        { name: 'codex-manager-v1' }
    )
);

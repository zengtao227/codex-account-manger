import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account } from '../types';

// ── Tauri invoke (graceful fallback for browser dev mode) ──────────────────
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<T>(cmd, args);
    } catch {
        console.warn(`[mock] tauri invoke: ${cmd}`, args);
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
    isLoading: boolean;
    error: string | null;

    addAccount: (alias: string, email?: string, authJson?: string) => Account;
    removeAccount: (id: string) => void;
    switchAccount: (id: string) => Promise<void>;
    renameAccount: (id: string, newAlias: string) => void;
    setAccounts: (accounts: Account[]) => void;
    setError: (error: string | null) => void;
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useAccountStore = create<AccountStore>()(
    persist(
        (set, get) => ({
            accounts: [],
            activeAccountId: null,
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
                    isActive: true, // Should be true as backend just logged it in
                    totalSessions: 1, // Already active
                };
                set((state) => ({
                    accounts: [...state.accounts, newAccount],
                    activeAccountId: newAccount.id // Sync Frontend with Backend reality
                }));
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

                    // CRITICAL: Write the FULL auth.json to ~/.codex/auth.json
                    if (target.authJson) {
                        await tauriInvoke('write_auth', { content: target.authJson });
                    } else {
                        throw new Error('此账户没有保存 auth.json 凭据，请重新登录');
                    }

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
                } catch (err) {
                    set({ isLoading: false, error: String(err) });
                    throw err;
                }
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
            setAccounts: (accounts) => set({ accounts }),
            setError: (error) => set({ error }),
        }),
        { name: 'codex-manager-v2' }  // v2: clean data schema, no fake usage
    )
);

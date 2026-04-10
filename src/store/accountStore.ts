import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account } from '../types';
import { matchAccountIdByAuth, parseAuthJson } from '../utils/auth';

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
    hasHydrated: boolean;

    addAccount: (alias: string, email?: string, authJson?: string, activate?: boolean) => Account;
    removeAccount: (id: string) => void;
    switchAccount: (id: string) => Promise<void>;
    syncCurrentAuth: () => Promise<void>;
    restoreAccounts: (accounts: Account[], activeAccountId: string | null) => Promise<void>;
    renameAccount: (id: string, newAlias: string) => void;
    setAccounts: (accounts: Account[]) => void;
    setError: (error: string | null) => void;
    setHasHydrated: (value: boolean) => void;
}

function syncStoredAuth(
    accounts: Account[],
    authJson: string,
    fallbackId: string | null,
    markActive: boolean
): { accounts: Account[]; matchedId: string | null } {
    const matchedId = matchAccountIdByAuth(accounts, authJson) ?? fallbackId;
    if (!matchedId) {
        return { accounts, matchedId: null };
    }

    const parsed = parseAuthJson(authJson);
    const updatedAccounts = accounts.map((account) => {
        if (account.id !== matchedId) {
            return markActive ? { ...account, isActive: false } : account;
        }

        return {
            ...account,
            authJson,
            email: parsed?.email || account.email,
            isActive: true,
        };
    });

    return { accounts: updatedAccounts, matchedId };
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useAccountStore = create<AccountStore>()(
    persist(
        (set, get) => ({
            accounts: [],
            activeAccountId: null,
            isLoading: false,
            error: null,
            hasHydrated: false,

            addAccount: (alias: string, email?: string, authJson?: string, activate = false) => {
                const initial = alias.charAt(0).toUpperCase();
                const parsedAuth = parseAuthJson(authJson);
                const newAccount: Account = {
                    id: generateId(),
                    alias,
                    email: email || parsedAuth?.email,
                    authJson,
                    avatarColor: getRandomColor(),
                    avatarInitial: initial,
                    addedAt: Date.now(),
                    isActive: activate,
                    totalSessions: activate ? 1 : 0,
                };
                set((state) => ({
                    accounts: [
                        ...state.accounts.map((account) => ({
                            ...account,
                            isActive: activate ? false : account.isActive,
                        })),
                        newAccount,
                    ],
                    activeAccountId: activate ? newAccount.id : state.activeAccountId,
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
                    let accounts = get().accounts;
                    const currentAuth = await tauriInvoke<string>('read_current_auth');
                    if (currentAuth?.trim()) {
                        const synced = syncStoredAuth(accounts, currentAuth, get().activeAccountId, false);
                        accounts = synced.accounts;
                    }

                    const target = accounts.find((a) => a.id === id);
                    if (!target) throw new Error('账户不存在');

                    await tauriInvoke('logout_codex');

                    // Refresh target auth first so stale stored access tokens do not require manual logout/login.
                    if (target.authJson) {
                        const refreshedAuth = await tauriInvoke<string>('refresh_auth_tokens', { content: target.authJson });
                        accounts = accounts.map((account) =>
                            account.id === id
                                ? {
                                    ...account,
                                    authJson: refreshedAuth,
                                    email: parseAuthJson(refreshedAuth)?.email || account.email,
                                }
                                : account
                        );

                        await tauriInvoke('write_auth', { content: refreshedAuth });
                    } else {
                        throw new Error('此账户没有保存 auth.json 凭据，请重新登录');
                    }

                    // Move the used account to the bottom of the list
                    const updatedAccounts = accounts.map((a: Account) => ({
                        ...a,
                        isActive: a.id === id,
                        lastUsedAt: a.id === id ? Date.now() : a.lastUsedAt,
                        totalSessions: a.id === id ? a.totalSessions + 1 : a.totalSessions,
                    }));

                    const currentIndex = updatedAccounts.findIndex((a: Account) => a.id === id);
                    if (currentIndex !== -1) {
                        const accountToMove = updatedAccounts.splice(currentIndex, 1)[0];
                        updatedAccounts.push(accountToMove);
                    }

                    set({
                        accounts: updatedAccounts,
                        activeAccountId: id,
                        isLoading: false,
                    });
                } catch (err) {
                    set({ isLoading: false, error: String(err) });
                    throw err;
                }
            },

            syncCurrentAuth: async () => {
                try {
                    const currentAuth = await tauriInvoke<string>('read_current_auth');
                    if (!currentAuth?.trim()) return;

                    const synced = syncStoredAuth(get().accounts, currentAuth, get().activeAccountId, true);
                    if (!synced.matchedId) return;

                    set({
                        accounts: synced.accounts,
                        activeAccountId: synced.matchedId,
                    });
                } catch (err) {
                    console.warn('syncCurrentAuth failed', err);
                }
            },

            restoreAccounts: async (accounts: Account[], activeAccountId: string | null) => {
                const normalizedAccounts = accounts.map((account) => ({
                    ...account,
                    isActive: account.id === activeAccountId,
                }));

                const activeAccount = normalizedAccounts.find((account) => account.id === activeAccountId) ?? null;
                if (activeAccount?.authJson) {
                    await tauriInvoke('write_auth', { content: activeAccount.authJson });
                }

                set({
                    accounts: normalizedAccounts,
                    activeAccountId,
                    isLoading: false,
                    error: null,
                });
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
            setHasHydrated: (value) => set({ hasHydrated: value }),
        }),
        {
            name: 'codex-manager-v1',
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);

export interface Account {
    id: string;
    alias: string;
    email?: string;
    authJson?: string;          // complete auth.json content from OpenAI
    avatarColor: string;
    avatarInitial: string;
    addedAt: number;
    lastUsedAt?: number;
    isActive: boolean;
    totalSessions: number;      // real: how many times switched to this account
}

export interface DailyUsage {
    date: string;               // YYYY-MM-DD
    sessions: number;
}

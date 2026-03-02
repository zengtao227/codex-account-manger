export interface Account {
    id: string;
    alias: string;
    email?: string;
    authJson?: string;          // encrypted/stored auth.json content
    avatarColor: string;        // hex color for avatar background
    avatarInitial: string;      // first letter for avatar
    addedAt: number;
    lastUsedAt?: number;
    isActive: boolean;
    totalSessions: number;
    weeklyUsagePercent: number;       // 0-100 local estimate
    fiveHourUsagePercent: number;     // 0-100 local estimate
    fiveHourResetAt?: number;
}

export interface UsageRecord {
    accountId: string;
    timestamp: number;
    sessionDurationMs?: number;
    note?: string;
}

export interface DailyUsage {
    date: string;             // YYYY-MM-DD
    sessions: number;
    estimatedPercent: number; // 0-100
}

export interface AppState {
    accounts: Account[];
    activeAccountId: string | null;
    isLoading: boolean;
    error: string | null;
}

import type { Account } from '../types';

const BACKUP_FORMAT = 'codex-manager-backup';
const BACKUP_VERSION = 1;

export type AccountBackupPayload = {
    format: typeof BACKUP_FORMAT;
    version: typeof BACKUP_VERSION;
    exportedAt: string;
    data: {
        activeAccountId: string | null;
        accounts: Account[];
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidAccount(value: unknown): value is Account {
    if (!isRecord(value)) return false;

    return (
        typeof value.id === 'string' &&
        typeof value.alias === 'string' &&
        typeof value.avatarColor === 'string' &&
        typeof value.avatarInitial === 'string' &&
        typeof value.addedAt === 'number' &&
        typeof value.isActive === 'boolean' &&
        typeof value.totalSessions === 'number' &&
        (value.email === undefined || typeof value.email === 'string') &&
        (value.authJson === undefined || typeof value.authJson === 'string') &&
        (value.lastUsedAt === undefined || typeof value.lastUsedAt === 'number')
    );
}

export function createBackupPayload(
    accounts: Account[],
    activeAccountId: string | null
): AccountBackupPayload {
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
            activeAccountId,
            accounts,
        },
    };
}

export function parseBackupPayload(raw: string): AccountBackupPayload {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
        throw new Error('备份文件格式无效');
    }

    if (parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION) {
        throw new Error('不是可识别的 Codex Manager 备份文件');
    }

    if (!isRecord(parsed.data) || !Array.isArray(parsed.data.accounts)) {
        throw new Error('备份数据缺少账户列表');
    }

    const accounts = parsed.data.accounts;
    if (!accounts.every(isValidAccount)) {
        throw new Error('备份文件中的账户数据格式无效');
    }

    const activeAccountId = parsed.data.activeAccountId;
    if (activeAccountId !== null && typeof activeAccountId !== 'string') {
        throw new Error('备份文件中的活跃账户标记无效');
    }

    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
        data: {
            activeAccountId,
            accounts,
        },
    };
}

export function buildBackupFilename(date = new Date()): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `codex-manager-backup-${yyyy}${mm}${dd}-${hh}${min}.json`;
}

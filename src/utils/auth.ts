import type { Account } from '../types';

type JwtPayload = Record<string, unknown>;

type ParsedJwtClaims = {
    email?: string;
    accountId?: string;
};

export type ParsedAuth = {
    raw: string;
    email?: string;
    accountId?: string;
    accessToken?: string;
    refreshToken?: string;
};

function decodeBase64Url(value: string): string | null {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

        if (typeof atob === 'function') {
            const decoded = atob(padded);
            const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
            return new TextDecoder().decode(bytes);
        }

        return null;
    } catch {
        return null;
    }
}

function decodeJwtPayload(token?: string): JwtPayload | null {
    if (!token) return null;

    const payload = token.split('.')[1];
    if (!payload) return null;

    const decoded = decodeBase64Url(payload);
    if (!decoded) return null;

    try {
        return JSON.parse(decoded) as JwtPayload;
    } catch {
        return null;
    }
}

function readNamespacedObject(
    payload: JwtPayload | null,
    namespace: string
): Record<string, unknown> | null {
    const value = payload?.[namespace];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function readJwtClaims(token?: string): ParsedJwtClaims {
    const payload = decodeJwtPayload(token);
    const authNs = readNamespacedObject(payload, 'https://api.openai.com/auth');
    const profileNs = readNamespacedObject(payload, 'https://api.openai.com/profile');

    const email =
        (typeof profileNs?.email === 'string' && profileNs.email) ||
        (typeof payload?.email === 'string' && payload.email) ||
        undefined;

    const accountId =
        (typeof authNs?.chatgpt_account_id === 'string' && authNs.chatgpt_account_id) ||
        undefined;

    return { email, accountId };
}

export function parseAuthJson(raw?: string): ParsedAuth | null {
    if (!raw?.trim()) return null;

    try {
        const parsed = JSON.parse(raw) as {
            email?: string;
            user?: { email?: string };
            token?: string;
            access_token?: string;
            refresh_token?: string;
            account_id?: string;
            tokens?: {
                access_token?: string;
                refresh_token?: string;
                id_token?: string;
                account_id?: string;
            };
        };

        const accessToken = parsed.tokens?.access_token || parsed.access_token || parsed.token;
        const refreshToken = parsed.tokens?.refresh_token || parsed.refresh_token;
        const idToken = parsed.tokens?.id_token;
        const accessClaims = readJwtClaims(accessToken);
        const idClaims = readJwtClaims(idToken);

        return {
            raw,
            accessToken,
            refreshToken,
            accountId:
                parsed.tokens?.account_id ||
                parsed.account_id ||
                accessClaims.accountId ||
                idClaims.accountId,
            email:
                parsed.user?.email ||
                parsed.email ||
                accessClaims.email ||
                idClaims.email,
        };
    } catch {
        return null;
    }
}

export function matchAccountIdByAuth(accounts: Account[], raw?: string): string | null {
    const currentAuth = parseAuthJson(raw);
    if (!currentAuth) return null;

    const matched = accounts.find((account) => {
        const stored = parseAuthJson(account.authJson);
        return Boolean(stored?.accountId && currentAuth.accountId && stored.accountId === currentAuth.accountId);
    });

    return matched?.id ?? null;
}

export function maskToken(token?: string): string {
    if (!token) return '无';
    if (token.length <= 18) return token;
    return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

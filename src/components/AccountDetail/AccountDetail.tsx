import { useState } from 'react';
import type { Account } from '../../types';
import { useAccountStore } from '../../store/accountStore';
import { showToast } from '../common/Toast';

interface AccountDetailProps {
    account: Account;
}

export function AccountDetail({ account }: AccountDetailProps) {
    const { switchAccount, removeAccount, activeAccountId, isLoading } = useAccountStore();
    const isActive = activeAccountId === account.id;

    const [editing, setEditing] = useState(false);
    const [newAlias, setNewAlias] = useState(account.alias);
    const renameAccount = useAccountStore((s) => s.renameAccount);

    async function handleSwitch() {
        if (isActive) return;
        try {
            await switchAccount(account.id);
            showToast(`已切换到「${account.alias}」，auth.json 已更新`, 'success');
        } catch (err) {
            showToast(`切换失败: ${err}`, 'error');
        }
    }

    function handleRename() {
        if (!newAlias.trim()) return;
        renameAccount(account.id, newAlias.trim());
        setEditing(false);
        showToast('账户名称已更新');
    }

    function handleDelete() {
        if (window.confirm(`确认删除账户「${account.alias}」？`)) {
            removeAccount(account.id);
            showToast(`账户「${account.alias}」已删除`, 'error');
        }
    }

    // Check if authJson contains a valid token
    const hasAuth = !!account.authJson;
    let tokenPreview = '无';
    if (account.authJson) {
        try {
            const parsed = JSON.parse(account.authJson);
            const token = parsed.access_token || parsed.token || '';
            if (token) {
                tokenPreview = token.substring(0, 12) + '...' + token.substring(token.length - 6);
            }
        } catch { /* ignore */ }
    }

    return (
        <div className="detail-panel">
            {/* Header */}
            <div className="detail-header">
                <div
                    className="detail-avatar"
                    style={{ background: account.avatarColor }}
                >
                    {account.avatarInitial}
                </div>
                <div className="detail-header__info">
                    {editing ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                className="form-input"
                                value={newAlias}
                                onChange={(e) => setNewAlias(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                                style={{ height: 32, fontSize: 14, padding: '0 10px' }}
                                autoFocus
                            />
                            <button className="btn btn--primary btn--sm" onClick={handleRename}>保存</button>
                            <button className="btn btn--secondary btn--sm" onClick={() => setEditing(false)}>取消</button>
                        </div>
                    ) : (
                        <div
                            className="detail-header__name"
                            onClick={() => setEditing(true)}
                            title="点击编辑名称"
                            style={{ cursor: 'pointer' }}
                        >
                            {account.alias}
                            <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }}>✎</span>
                        </div>
                    )}
                    {account.email && (
                        <div className="detail-header__email">{account.email}</div>
                    )}
                    <div className="detail-header__meta">
                        <span className={`badge badge--dot ${isActive ? 'badge--active' : 'badge--inactive'}`}>
                            {isActive ? '使用中' : '待机'}
                        </span>
                        <span className="badge badge--inactive">
                            {account.totalSessions} 次切换
                        </span>
                    </div>
                </div>

                {/* Delete button */}
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn--danger btn--sm" onClick={handleDelete}>
                        删除
                    </button>
                </div>
            </div>

            {/* Switch Button */}
            {!isActive && (
                <button
                    className="btn btn--primary btn--full"
                    style={{ marginBottom: 20, fontSize: 14, padding: '12px' }}
                    onClick={handleSwitch}
                    disabled={isLoading || !hasAuth}
                >
                    {isLoading ? (
                        <><span className="spinner" /> 切换中…</>
                    ) : !hasAuth ? (
                        <>⚠️ 无凭据，请重新登录</>
                    ) : (
                        <>⚡ 切换到此账户</>
                    )}
                </button>
            )}

            {isActive && (
                <div style={{
                    marginBottom: 20,
                    padding: '12px 16px',
                    background: 'var(--bg-active)',
                    border: '1px solid var(--border-accent)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--text-accent)',
                }}>
                    <span>●</span> 当前正在使用此账户 — ~/.codex/auth.json 已同步
                </div>
            )}

            {/* Account Info Card */}
            <div className="card">
                <div className="card__title">
                    <span className="card__title-dot" />
                    账户信息
                </div>

                <div className="stats-row">
                    <div className="stat-item">
                        <div className="stat-value">{hasAuth ? '✅ 有效' : '❌ 缺失'}</div>
                        <div className="stat-label">凭据状态</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{account.totalSessions}</div>
                        <div className="stat-label">切换次数</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{formatDate(account.addedAt)}</div>
                        <div className="stat-label">添加时间</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">
                            {account.lastUsedAt ? formatDate(account.lastUsedAt) : '—'}
                        </div>
                        <div className="stat-label">最后使用</div>
                    </div>
                </div>

                {/* Token preview */}
                <div style={{
                    marginTop: 16,
                    padding: '10px 14px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: 'var(--text-muted)',
                    wordBreak: 'break-all',
                }}>
                    <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>Token</div>
                    {tokenPreview}
                </div>

                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    💡 Codex 用量限额（5小时/每周）请在 Codex IDE 中查看
                </div>
            </div>
        </div>
    );
}

function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

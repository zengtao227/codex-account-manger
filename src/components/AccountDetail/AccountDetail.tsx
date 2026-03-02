import { useState } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, AreaChart
} from 'recharts';
import type { Account } from '../../types';
import { useAccountStore } from '../../store/accountStore';
import { RingChart } from '../common/RingChart';
import { showToast } from '../common/Toast';

interface AccountDetailProps {
    account: Account;
}

export function AccountDetail({ account }: AccountDetailProps) {
    const { switchAccount, removeAccount, updateAccountUsage, usageHistory, activeAccountId, isLoading } = useAccountStore();
    const isActive = activeAccountId === account.id;

    // Simulated 7-day usage data (demo)
    const history = usageHistory[account.id] || generateDemoHistory();

    const [editing, setEditing] = useState(false);
    const [newAlias, setNewAlias] = useState(account.alias);
    const renameAccount = useAccountStore((s) => s.renameAccount);

    async function handleSwitch() {
        if (isActive) return;
        await switchAccount(account.id);
        showToast(`已切换到「${account.alias}」`, 'success');
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

    // Demo: simulate usage refresh
    function handleRefreshUsage() {
        const fh = Math.floor(Math.random() * 80);
        const wk = Math.floor(Math.random() * 60);
        updateAccountUsage(account.id, fh, wk);
        showToast('用量数据已刷新');
    }

    const fiveH = account.fiveHourUsagePercent;
    const weekly = account.weeklyUsagePercent;

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
                            {account.totalSessions} 次会话
                        </span>
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button
                        className="btn btn--secondary btn--sm"
                        onClick={handleRefreshUsage}
                        title="刷新用量"
                    >
                        ↻ 刷新
                    </button>
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
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <><span className="spinner" /> 切换中…</>
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
                    <span>●</span> 当前正在使用此账户
                </div>
            )}

            {/* Token Usage */}
            <div className="card">
                <div className="card__title">
                    <span className="card__title-dot" />
                    Token 用量
                </div>

                <div className="usage-grid">
                    <RingChart
                        percent={fiveH}
                        size={110}
                        label="5小时额度"
                        sublabel={fiveH >= 80 ? '⚠️ 即将用尽' : fiveH === 0 ? '暂无数据' : '剩余充足'}
                    />
                    <RingChart
                        percent={weekly}
                        size={110}
                        label="本周额度"
                        sublabel={weekly >= 80 ? '⚠️ 即将用尽' : weekly === 0 ? '暂无数据' : '剩余充足'}
                    />
                </div>

                {/* Weekly bar */}
                <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>本周累计</span>
                        <span>{weekly}%</span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className={`progress-bar__fill ${weekly < 60 ? 'progress-bar__fill--green' : weekly < 80 ? 'progress-bar__fill--yellow' : 'progress-bar__fill--red'}`}
                            style={{ width: `${weekly}%` }}
                        />
                    </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    💡 数据基于本地会话记录估算。点击「刷新」更新。
                </div>
            </div>

            {/* 7-Day Trend */}
            <div className="card">
                <div className="card__title">
                    <span className="card__title-dot" style={{ background: 'var(--info)' }} />
                    7日使用趋势
                </div>
                <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id={`grad-${account.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={account.avatarColor} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={account.avatarColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis domain={[0, 100]} hide />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-panel)',
                                    border: '1px solid var(--border-normal)',
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                                formatter={(val: number | undefined) => [`${val ?? 0}%`, '估算用量']}
                            />
                            <Area
                                type="monotone"
                                dataKey="estimatedPercent"
                                stroke={account.avatarColor}
                                strokeWidth={2}
                                fill={`url(#grad-${account.id})`}
                                dot={{ fill: account.avatarColor, strokeWidth: 0, r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-item">
                    <div className="stat-value">{account.totalSessions}</div>
                    <div className="stat-label">总会话数</div>
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
        </div>
    );
}

function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function generateDemoHistory() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days.push({
            date: dateStr,
            sessions: 0,
            estimatedPercent: 0,
        });
    }
    return days;
}

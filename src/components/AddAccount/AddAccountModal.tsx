import { useState } from 'react';
import { useAccountStore } from '../../store/accountStore';
import { showToast } from '../common/Toast';

interface AddAccountModalProps {
    onClose: () => void;
}

type Step = 'method' | 'oauth_waiting' | 'oauth_success' | 'manual';

// Tauri invoke with browser fallback
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<T>(cmd, args);
    } catch {
        throw new Error(`[dev mode] tauri command '${cmd}' not available in browser`);
    }
}

export function AddAccountModal({ onClose }: AddAccountModalProps) {
    const [step, setStep] = useState<Step>('method');
    const [alias, setAlias] = useState('');
    const [email, setEmail] = useState('');
    const [authJson, setAuthJson] = useState('');
    const [error, setError] = useState('');
    const [capturedAuth, setCapturedAuth] = useState('');
    const addAccount = useAccountStore((s) => s.addAccount);

    // ── OAuth Login ────────────────────────────────────────────────────────
    async function handleOAuthLogin() {
        setStep('oauth_waiting');
        setError('');

        try {
            // Calls Rust backend: opens Terminal with `codex login`, polls for auth.json
            const authContent = await tauriInvoke<string>('start_oauth_login');
            setCapturedAuth(authContent);

            // Extract email from auth.json if present
            try {
                const parsed = JSON.parse(authContent);
                const detectedEmail = parsed?.user?.email || parsed?.email || '';
                setEmail(detectedEmail);
                if (detectedEmail) {
                    setAlias(detectedEmail.split('@')[0]);
                }
            } catch { /* ignore */ }

            setStep('oauth_success');
        } catch (err) {
            setError(String(err).replace('Error: ', ''));
            setStep('method');
        }
    }

    // ── Save OAuth Account ─────────────────────────────────────────────────
    function handleSaveOAuthAccount() {
        setError('');
        if (!alias.trim()) {
            setError('请输入账户别名');
            return;
        }
        addAccount(alias.trim(), email.trim() || undefined, capturedAuth);
        showToast(`✅ 账户「${alias.trim()}」登录并保存成功！`, 'success');
        onClose();
    }

    // ── Manual Add ─────────────────────────────────────────────────────────
    function handleManualAdd() {
        setError('');
        if (!alias.trim()) {
            setError('请输入账户别名');
            return;
        }
        if (authJson.trim()) {
            try {
                JSON.parse(authJson);
            } catch {
                setError('auth.json 格式无效，请检查内容');
                return;
            }
        }
        addAccount(alias.trim(), email.trim() || undefined, authJson.trim() || undefined);
        showToast(`✨ 账户「${alias.trim()}」已添加`);
        onClose();
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">

                {/* ── Step: Method Selection ── */}
                {step === 'method' && (
                    <>
                        <div className="modal__title">添加账户</div>
                        <div className="modal__subtitle">
                            选择添加方式。登录凭据仅在本地存储，不会上传任何服务器。
                        </div>

                        {error && (
                            <div style={{
                                color: 'var(--danger)', fontSize: 12, marginBottom: 14,
                                background: 'rgba(239,68,68,0.08)', padding: '10px 12px',
                                borderRadius: 8, lineHeight: 1.5,
                            }}>
                                ⚠️ {error}
                            </div>
                        )}

                        {/* OAuth Button — Primary */}
                        <button
                            className="method-card method-card--primary"
                            onClick={handleOAuthLogin}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                                background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))',
                                border: '1px solid var(--border-accent)',
                                borderRadius: 'var(--radius-lg)', padding: '18px',
                                cursor: 'pointer', marginBottom: 10,
                                transition: 'all 0.15s', color: 'var(--text-primary)',
                                fontFamily: 'inherit',
                            }}
                        >
                            <div style={{
                                width: 44, height: 44,
                                background: 'var(--accent)', borderRadius: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 22, flexShrink: 0,
                                boxShadow: '0 0 16px var(--accent-glow)',
                            }}>
                                🔐
                            </div>
                            <div style={{ textAlign: 'left', flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: 'var(--text-accent)' }}>
                                    ChatGPT OAuth 登录 ⭐
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    打开终端自动完成授权，无需手动复制任何文件
                                </div>
                            </div>
                            <div style={{ color: 'var(--accent)', fontSize: 18 }}>›</div>
                        </button>

                        {/* Manual import */}
                        <button
                            onClick={() => setStep('manual')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                                background: 'var(--bg-card)', border: '1px solid var(--border-normal)',
                                borderRadius: 'var(--radius-lg)', padding: '16px',
                                cursor: 'pointer', marginBottom: 10,
                                transition: 'all 0.15s', color: 'var(--text-primary)',
                                fontFamily: 'inherit',
                            }}
                        >
                            <div style={{
                                width: 44, height: 44, background: 'var(--bg-hover)',
                                borderRadius: 12, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 20, flexShrink: 0,
                            }}>📄</div>
                            <div style={{ textAlign: 'left', flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>手动导入 auth.json</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    从 ~/.codex/auth.json 粘贴内容手动添加
                                </div>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</div>
                        </button>

                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn--secondary" onClick={onClose}>取消</button>
                        </div>
                    </>
                )}

                {/* ── Step: OAuth Waiting ── */}
                {step === 'oauth_waiting' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                            正在等待登录...
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
                            终端已打开，正在运行 <code style={{ background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4 }}>codex login</code><br />
                            请在浏览器中完成 ChatGPT 授权<br />
                            <span style={{ color: 'var(--accent)', fontSize: 12 }}>完成后将自动保存账户到 Codex Manager</span>
                        </div>

                        {/* Animated dots */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
                            {[0, 1, 2].map((i) => (
                                <div key={i} style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: 'var(--accent)',
                                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                                }} />
                            ))}
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20 }}>
                            最长等待 120 秒 · 完成后自动继续
                        </div>

                        <button className="btn btn--secondary btn--sm" onClick={() => {
                            setStep('method');
                        }}>
                            取消
                        </button>
                    </div>
                )}

                {/* ── Step: OAuth Success ── */}
                {step === 'oauth_success' && (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: 'var(--text-accent)' }}>
                                登录成功！
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                已捕获授权凭据，请为此账户命名
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">账户别名 *</label>
                            <input
                                className="form-input"
                                placeholder="例如：个人账户 / 工作账户"
                                value={alias}
                                onChange={(e) => setAlias(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveOAuthAccount()}
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">邮箱地址（已自动检测）</label>
                            <input
                                className="form-input"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div style={{
                            background: 'var(--bg-active)', border: '1px solid var(--border-accent)',
                            borderRadius: 8, padding: '8px 12px', fontSize: 11,
                            color: 'var(--text-accent)', marginBottom: 20, lineHeight: 1.5,
                        }}>
                            🔒 凭据已本地保存，从不上传
                        </div>

                        <div className="modal__footer">
                            <button className="btn btn--secondary" onClick={onClose} style={{ flex: 1 }}>
                                取消
                            </button>
                            <button className="btn btn--primary" onClick={handleSaveOAuthAccount} style={{ flex: 2 }}>
                                保存账户
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step: Manual Import ── */}
                {step === 'manual' && (
                    <>
                        <button
                            onClick={() => setStep('method')}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', fontSize: 13, marginBottom: 16,
                                display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                            }}
                        >
                            ← 返回
                        </button>
                        <div className="modal__title">手动导入</div>
                        <div className="modal__subtitle">
                            在终端运行 <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>cat ~/.codex/auth.json</code>，将内容粘贴到下方。
                        </div>

                        <div className="form-group">
                            <label className="form-label">账户别名 *</label>
                            <input
                                className="form-input"
                                placeholder="例如：个人 Plus / 工作 Pro"
                                value={alias}
                                onChange={(e) => setAlias(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">邮箱（选填）</label>
                            <input
                                className="form-input"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                type="email"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">auth.json 内容（选填）</label>
                            <textarea
                                className="form-input form-input--textarea"
                                placeholder={'{\n  "token": "...",\n  ...\n}'}
                                value={authJson}
                                onChange={(e) => setAuthJson(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div style={{
                                color: 'var(--danger)', fontSize: 12, marginBottom: 12,
                                background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8,
                            }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div style={{
                            background: 'var(--bg-card)', borderRadius: 8,
                            padding: '10px 12px', fontSize: 11,
                            color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20,
                        }}>
                            🔒 凭据仅存储于本地，从不上传。
                        </div>

                        <div className="modal__footer">
                            <button className="btn btn--secondary" onClick={onClose} style={{ flex: 1 }}>取消</button>
                            <button className="btn btn--primary" onClick={handleManualAdd} style={{ flex: 2 }}>
                                添加账户
                            </button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}

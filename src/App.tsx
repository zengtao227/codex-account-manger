import { useEffect, useState } from 'react';
import './index.css';
import { AccountList } from './components/AccountList/AccountList';
import { AccountDetail } from './components/AccountDetail/AccountDetail';
import { ToastContainer } from './components/common/Toast';
import { useAccountStore } from './store/accountStore';

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { accounts, syncCurrentAuth } = useAccountStore();

  useEffect(() => {
    void syncCurrentAuth();
  }, [syncCurrentAuth]);

  const selectedAccount = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null;

  // Sync selection with accounts list
  const effectiveSelected = selectedAccount ?? null;

  return (
    <div className="app-shell">
      {/* Native titlebar will be provided by OS, we keep a minimal header for logo/version */}
      <header className="titlebar" style={{ paddingLeft: 80 }}>
        <div className="titlebar__logo">
          <div className="titlebar__logo-icon">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L10.5 9H1.5L6 1Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="titlebar__logo-text">Codex Manager</span>
        </div>
        <div className="titlebar__version">v0.1.2</div>
      </header>

      {/* Main */}
      <div className="main-layout">
        <AccountList
          selectedId={effectiveSelected?.id ?? null}
          onSelect={setSelectedId}
        />

        <main style={{ flex: 1, overflow: 'hidden' }}>
          {effectiveSelected ? (
            <AccountDetail account={effectiveSelected} />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="var(--border-normal)" strokeWidth="2" strokeDasharray="6 4" />
          <path d="M20 32 L44 32 M32 20 L32 44" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
        </svg>
      </div>
      <div className="empty-state__title">欢迎使用 Codex Manager</div>
      <div className="empty-state__desc">
        点击左侧「添加账户」<br />开始管理你的 Codex CLI 账户
      </div>
    </div>
  );
}

export default App;

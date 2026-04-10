import { useState } from 'react';
import type { Account } from '../../types';
import { useAccountStore } from '../../store/accountStore';
import { AddAccountModal } from '../AddAccount/AddAccountModal';
import { showToast } from '../common/Toast';
import { buildBackupFilename, createBackupPayload, parseBackupPayload } from '../../utils/accountBackup';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent as DndDragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface AccountListProps {
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export function AccountList({ selectedId, onSelect }: AccountListProps) {
    const [showAdd, setShowAdd] = useState(false);
    const [isBackupBusy, setIsBackupBusy] = useState(false);
    const { accounts, activeAccountId, setAccounts, restoreAccounts } = useAccountStore();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DndDragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = accounts.findIndex((acc) => acc.id === active.id);
            const newIndex = accounts.findIndex((acc) => acc.id === over.id);

            setAccounts(arrayMove(accounts, oldIndex, newIndex));
        }
    };

    async function handleExportBackup() {
        if (isBackupBusy) return;
        setIsBackupBusy(true);

        try {
            const [{ save }, { writeTextFile }] = await Promise.all([
                import('@tauri-apps/plugin-dialog'),
                import('@tauri-apps/plugin-fs'),
            ]);

            const payload = createBackupPayload(accounts, activeAccountId);
            const filePath = await save({
                defaultPath: buildBackupFilename(),
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });

            if (!filePath) return;

            await writeTextFile(filePath, JSON.stringify(payload, null, 2));
            showToast(`已导出 ${accounts.length} 个账户的备份`, 'success');
        } catch (err) {
            showToast(`备份失败: ${String(err)}`, 'error');
        } finally {
            setIsBackupBusy(false);
        }
    }

    async function handleRestoreBackup() {
        if (isBackupBusy) return;

        const confirmed = window.confirm(
            '恢复备份会用文件中的账户数据替换当前列表。建议先做一次备份。是否继续？'
        );
        if (!confirmed) return;

        setIsBackupBusy(true);

        try {
            const [{ open }, { readTextFile }] = await Promise.all([
                import('@tauri-apps/plugin-dialog'),
                import('@tauri-apps/plugin-fs'),
            ]);

            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });

            if (!selected || Array.isArray(selected)) return;

            const content = await readTextFile(selected);
            const backup = parseBackupPayload(content);

            await restoreAccounts(backup.data.accounts, backup.data.activeAccountId);
            showToast(`已恢复 ${backup.data.accounts.length} 个账户`, 'success');
        } catch (err) {
            showToast(`恢复失败: ${String(err)}`, 'error');
        } finally {
            setIsBackupBusy(false);
        }
    }

    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <span className="sidebar__label">账户</span>
                <button
                    className="btn btn--icon"
                    onClick={() => setShowAdd(true)}
                    title="添加账户"
                    style={{ width: 24, height: 24, fontSize: 18, borderRadius: 6 }}
                >
                    +
                </button>
            </div>

            <div className="sidebar__list">
                {accounts.length === 0 ? (
                    <div style={{ padding: '20px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>👤</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            点击 + 添加第一个账户
                        </div>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={accounts.map(acc => acc.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {accounts.map((acc) => (
                                <SortableAccountItem
                                    key={acc.id}
                                    account={acc}
                                    isSelected={selectedId === acc.id}
                                    isActive={activeAccountId === acc.id}
                                    onClick={() => onSelect(acc.id)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            <div className="sidebar__footer">
                <div className="sidebar__actions">
                    <button
                        className="btn btn--secondary btn--sm btn--full"
                        onClick={() => void handleExportBackup()}
                        disabled={isBackupBusy || accounts.length === 0}
                    >
                        {isBackupBusy ? '处理中…' : '备份账户'}
                    </button>
                    <button
                        className="btn btn--secondary btn--sm btn--full"
                        onClick={() => void handleRestoreBackup()}
                        disabled={isBackupBusy}
                    >
                        {isBackupBusy ? '处理中…' : '恢复备份'}
                    </button>
                </div>
                <button
                    className="btn btn--secondary btn--full btn--sm"
                    onClick={() => setShowAdd(true)}
                >
                    <span>＋</span> 添加账户
                </button>
            </div>

            {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
        </aside>
    );
}

function SortableAccountItem({
    account,
    isSelected,
    isActive,
    onClick,
}: {
    account: Account;
    isSelected: boolean;
    isActive: boolean;
    onClick: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: account.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`account-item ${isSelected ? 'account-item--active' : ''} ${isDragging ? 'account-item--dragging' : ''}`}
            onClick={onClick}
        >
            <div className="account-item__drag-handle account-item__drag-handle--left" {...attributes} {...listeners}>
                <GripVertical size={14} />
            </div>

            <div
                className="account-avatar"
                style={{ background: account.avatarColor }}
            >
                {account.avatarInitial}
                {isActive && <div className="account-avatar__badge" />}
            </div>

            <div className="account-info">
                <div className="account-info__name">{account.alias}</div>
                {isActive ? (
                    <div className="account-info__status">使用中</div>
                ) : account.email ? (
                    <div className="account-info__email">{account.email}</div>
                ) : (
                    <div className="account-info__email">
                        {account.lastUsedAt
                            ? `上次: ${formatTimeAgo(account.lastUsedAt)}`
                            : '从未使用'}
                    </div>
                )}
            </div>

            <div className="account-item__drag-handle account-item__drag-handle--right" {...attributes} {...listeners}>
                <GripVertical size={14} />
            </div>
        </div>
    );
}

function formatTimeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m}分钟前`;
    if (h < 24) return `${h}小时前`;
    return `${d}天前`;
}

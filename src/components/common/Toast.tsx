import { useState, useCallback, useEffect } from 'react';

interface ToastItem {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

let _showToast: ((msg: string, type?: 'success' | 'error' | 'info') => void) | null = null;

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    _showToast?.(message, type);
}

const ICONS = { success: '✅', error: '❌', info: 'ℹ️' };

export function ToastContainer() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    useEffect(() => {
        _showToast = addToast;
        return () => { _showToast = null; };
    }, [addToast]);

    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast--${t.type}`}>
                    <span className="toast__icon">{ICONS[t.type]}</span>
                    {t.message}
                </div>
            ))}
        </div>
    );
}

import React, { useState, useEffect } from 'react';

// Simple event emitter for toasts
const toastListeners = new Set();

export const toast = {
  success: (msg) => notify({ type: 'success', message: msg }),
  info: (msg) => notify({ type: 'info', message: msg }),
  warning: (msg) => notify({ type: 'warning', message: msg }),
  error: (msg) => notify({ type: 'error', message: msg })
};

function notify(toastObj) {
  const id = Date.now() + Math.random();
  toastListeners.forEach(listener => listener({ ...toastObj, id }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (newToast) => {
      setToasts(prev => [...prev, newToast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 3000);
    };
    toastListeners.add(listener);
    return () => toastListeners.delete(listener);
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {toasts.map(t => {
        let bg = "#3b82f6"; // info
        if (t.type === 'success') bg = "#10b981";
        if (t.type === 'warning') bg = "#f59e0b";
        if (t.type === 'error') bg = "#ef4444";

        return (
          <div key={t.id} style={{ background: bg, color: "white", padding: "12px 16px", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", gap: "12px", minWidth: "250px", maxWidth: "400px", animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <span style={{ flex: 1, fontSize: "14px", fontWeight: "500" }}>{t.message}</span>
            <button onClick={() => removeToast(t.id)} style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", opacity: 0.8, fontSize: "16px", padding: 0 }}>✕</button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

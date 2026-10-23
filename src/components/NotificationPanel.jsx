import React, { useState, useEffect } from 'react'

const NOTIF_ICONS = { budget_warn: '⚠️', budget_alert: '🔴', bill_due: '📅', info: 'ℹ️', recap: '📊' }

function timeAgo(ts) {
  const d = Date.now() - ts
  if (d < 60000) return 'just now'
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago'
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago'
  return Math.floor(d / 86400000) + 'd ago'
}

export default function NotificationPanel() {
  const [panelOpen, setPanelOpen] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function onOpen()  { setPanelOpen(true);  setTick(v => v + 1) }
    function onClose() { setPanelOpen(false) }
    function onRender() { setTick(v => v + 1) }
    document.addEventListener('ks:notifications-open',  onOpen)
    document.addEventListener('ks:notifications-close', onClose)
    document.addEventListener('ks:notifications-render', onRender)
    return () => {
      document.removeEventListener('ks:notifications-open',  onOpen)
      document.removeEventListener('ks:notifications-close', onClose)
      document.removeEventListener('ks:notifications-render', onRender)
    }
  }, [])

  const notifs = (window.state || {}).notifications || []

  return (
    <div
      id="notif-panel-overlay"
      className={`notif-panel-overlay${panelOpen ? ' open' : ''}`}
    >
      <div
        className="notif-panel-backdrop"
        onClick={() => window.closeNotificationPanel?.()}
      />
      <div className="notif-panel">
        <div className="notif-panel-header">
          <span className="notif-panel-title">🔔 Notifications</span>
          <div className="notif-panel-actions">
            <button
              className="notif-read-all-btn"
              onClick={() => window.markAllNotificationsRead?.()}
            >
              Mark all read
            </button>
            <button
              className="notif-close-btn"
              onClick={() => window.closeNotificationPanel?.()}
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>
        </div>
        <div id="notif-list" className="notif-list">
          {notifs.length === 0 ? (
            <div className="notif-empty">
              <span style={{ fontSize: '2rem', opacity: 0.4 }}>🔔</span>
              <span>No notifications</span>
            </div>
          ) : notifs.map(n => (
            <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
              <span className="notif-item-icon">{NOTIF_ICONS[n.type] || '🔔'}</span>
              <div className="notif-item-body">
                <div className="notif-item-title">{n.title}</div>
                <div className="notif-item-desc">{n.body}</div>
                <div className="notif-item-time">{timeAgo(n.createdAt)}</div>
              </div>
              <button
                className="notif-item-dismiss"
                data-action={`clearNotification('${n.id}')`}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

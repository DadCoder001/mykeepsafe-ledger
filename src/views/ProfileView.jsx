import React, { useState, useEffect } from 'react'

const ISSUES_URL = 'https://github.com/DadCoder001/mykeepsafe-ledger/issues'

export default function ProfileView() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function handler() { setTick(v => v + 1) }
    document.addEventListener('ks:profile-render', handler)
    return () => document.removeEventListener('ks:profile-render', handler)
  }, [])

  useEffect(() => {
    if (!tick) return
    window.renderHouseholdSection?.()
  }, [tick])

  const settings = (tick && window.state?.settings) || {}
  const userName = settings.userName || ''
  const initials = userName.trim().charAt(0).toUpperCase()
  const dataLocation = window.getDataLocationLabel?.() || 'This browser on this computer'

  return (
    <div id="profile-view">
      <div className="profile-wrap">
        <div className="profile-view-header">
          <div className="profile-big-avatar" id="profile-big-avatar">{initials || '👤'}</div>
          <div className="profile-header-info">
            <h2 id="profile-display-name">{userName || 'Your Profile'}</h2>
            <p>Your data stays on this computer</p>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-header">Your Profile</div>
          <div className="profile-section-body">
            <div className="profile-row">
              <label>Name</label>
              <div className="profile-row-input">
                <input
                  key={tick ? 'ready' : 'boot'}
                  id="profile-name-input"
                  type="text"
                  className="sb-input"
                  style={{ marginBottom: 0 }}
                  placeholder="e.g. Alex"
                  defaultValue={userName}
                />
                <button className="sb-btn" style={{ width: 'auto', padding: '8px 16px', marginBottom: 0, flexShrink: 0 }} data-action="saveProfileName()">Save</button>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-header">Household Members</div>
          <div className="profile-section-body" id="household-members-body"></div>
        </div>

        <div className="profile-section">
          <div className="profile-section-header">Data &amp; Privacy</div>
          <div className="profile-section-body">
            <p className="profile-about" style={{ marginBottom: '0.75rem' }}>
              Saved to: <strong id="profile-data-location">{dataLocation}</strong>
            </p>
            <div className="profile-data-actions">
              <button className="profile-action-btn" data-action="exportJSON()">
                <span className="pab-icon">📤</span>
                <span><strong>Export Backup</strong><span className="pab-sub">Download your data as a JSON file</span></span>
              </button>
              <button className="profile-action-btn" data-action="document.getElementById('import-file').click()">
                <span className="pab-icon">📥</span>
                <span><strong>Import / Restore</strong><span className="pab-sub">Merge a MyKeepSafe Ledger JSON backup into your data</span></span>
              </button>
              <button className="profile-action-btn danger" data-action="confirmResetAppData()">
                <span className="pab-icon">🗑️</span>
                <span><strong>Reset App Data</strong><span className="pab-sub">Permanently delete all local data and start fresh</span></span>
              </button>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-header">About</div>
          <div className="profile-section-body">
            <p className="profile-about"><strong>MyKeepSafe Ledger</strong> <span id="profile-app-version">v1.0.0</span> &mdash; an open-source, local-only personal finance app. Your financial data never leaves this computer: no accounts, no cloud, no telemetry.</p>
            <p className="profile-about" style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--ink3)' }}>
              Free software under the MIT License. It provides tools and analysis only &mdash; not legal, tax, accounting, or investment advice.{' '}
              Found a bug or have an idea? <a href={ISSUES_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Open an issue on GitHub</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

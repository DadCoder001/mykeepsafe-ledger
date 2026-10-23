import React, { useState, useEffect } from 'react'

// Sticky ribbon shown only while exploring the sample data. Nothing done in
// the demo is saved; the button clears it and starts a fresh ledger.
export default function DemoBanner() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    // Re-check mode on every render trigger.
    function bump() { setTick(v => v + 1) }
    document.addEventListener('ks:sidebar-render', bump)
    document.addEventListener('ks:accounts-render', bump)
    document.addEventListener('ks:month-render', bump)
    document.addEventListener('ks:mode-change', bump)
    return () => {
      document.removeEventListener('ks:sidebar-render', bump)
      document.removeEventListener('ks:accounts-render', bump)
      document.removeEventListener('ks:month-render', bump)
      document.removeEventListener('ks:mode-change', bump)
    }
  }, [])

  const mode = window.getAppMode?.() || 'full'
  if (mode !== 'demo') return null

  return (
    <div
      role="region"
      aria-label="Demo mode banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1200,
        background: 'linear-gradient(90deg, var(--accent), var(--accent2, var(--accent)))',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        fontSize: '0.9rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        flexWrap: 'wrap',
      }}
    >
      <span>
        You're exploring <strong>sample data</strong>. Nothing you change here is saved.
      </span>
      <button
        onClick={() => window.exitDemoMode?.()}
        style={{
          background: '#fff',
          color: 'var(--accent)',
          border: 'none',
          borderRadius: '999px',
          padding: '5px 14px',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Start with my own data →
      </button>
    </div>
  )
}

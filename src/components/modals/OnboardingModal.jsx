import React from 'react'

export default function OnboardingModal() {
  return (
    <div id="onboarding-modal" className="obm-overlay" style={{ display: 'none' }}>
      <div className="obm-modal">
        <button className="obm-close" data-action="closeOnboardingModal()">✕</button>
        <div className="obm-icon">💰</div>
        <h2>Welcome to MyKeepSafe Ledger</h2>
        <p>Be your own CFO. Everything stays on this computer &mdash; no accounts, no cloud. Here&rsquo;s how to get started:</p>
        <div className="obm-steps">
          <div className="obm-step">
            <div className="obm-step-icon">📅</div>
            <div className="obm-step-title">Track monthly spending</div>
            <div className="obm-step-desc">Go to the Month tab, set your budget, and add income &amp; expenses</div>
          </div>
          <div className="obm-step">
            <div className="obm-step-icon">🏦</div>
            <div className="obm-step-title">Add your accounts</div>
            <div className="obm-step-desc">Add checking, savings, and investment accounts on the Dashboard</div>
          </div>
          <div className="obm-step">
            <div className="obm-step-icon">📥</div>
            <div className="obm-step-title">Import bank transactions</div>
            <div className="obm-step-desc">Use &ldquo;Import Bank CSV&rdquo; to pull in transactions directly from your bank export</div>
          </div>
          <div className="obm-step">
            <div className="obm-step-icon">✦</div>
            <div className="obm-step-title">Ask the AI advisor</div>
            <div className="obm-step-desc">Ask what changed, where your money went, and what to do next &mdash; the model runs on this computer</div>
          </div>
        </div>
        <button className="obm-demo-btn" data-action="exploreSampleData()">Explore with sample data first</button>
        <button className="obm-cta" data-action="closeOnboardingModal()">Let&rsquo;s go →</button>
      </div>
    </div>
  )
}

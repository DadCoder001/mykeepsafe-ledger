import React from 'react'

export default function SubscriptionReviewModal() {
  return (
    <div id="subscription-review-modal" className="upgrade-overlay" style={{ display: 'none' }} onClick={(e) => { if (e.target === e.currentTarget) window.closeSubscriptionModal?.() }}>
      <div className="upgrade-modal" style={{ maxWidth: '520px' }}>
        <div className="ugm-header">
          <span className="ugm-lock">🔁</span>
          <h2>Recurring Charges Detected</h2>
          <p>These transactions appear monthly. Add them as Fixed Expenses to track them automatically.</p>
        </div>
        <div className="ugm-body">
          <div id="sub-review-list" className="sub-review-list"></div>
          <div className="ugm-actions">
            <button className="ugm-btn-ghost" onClick={() => window.closeSubscriptionModal?.()}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}

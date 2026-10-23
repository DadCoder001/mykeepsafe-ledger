import React, { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import AISidePanel from './components/AISidePanel'
import TxSlidePanel from './components/TxSlidePanel'
import DashboardView from './views/DashboardView'
import AccountsView from './views/AccountsView'
import MonthView from './views/MonthView'
import OverviewView from './views/OverviewView'
import ForecastView from './views/ForecastView'
import FixedView from './views/FixedView'
import NetWorthView from './views/NetWorthView'
import AIView from './views/AIView'
import ProfileView from './views/ProfileView'
import FileSetupModal from './components/modals/FileSetupModal'
import OnboardingModal from './components/modals/OnboardingModal'
import CommandPalette from './components/modals/CommandPalette'
import SubscriptionReviewModal from './components/modals/SubscriptionReviewModal'
import CSVModal from './components/modals/CSVModal'
import ModelSetupModal from './components/modals/ModelSetupModal'
import DemoBanner from './components/DemoBanner'
import NotificationPanel from './components/NotificationPanel'
import './styles/main.css'

export default function App() {
  useEffect(() => {
    const init = window._legacyInit?.()
    if (init && typeof init.then === 'function') {
      init.then(() => { window._legacyInitDone = true })
    } else {
      window._legacyInitDone = true
    }
  }, [])

  return (
    <div style={{ display: 'contents' }}>
      <DemoBanner />
      <Sidebar />

      <main className="main">

        <div className="print-header" id="print-header" style={{ display: 'none' }}></div>

        {/* DASHBOARD VIEW */}
        <DashboardView />

        {/* ACCOUNTS VIEW */}
        <AccountsView />

        {/* MONTH VIEW */}
        <MonthView />

        {/* OVERVIEW VIEW */}
        <OverviewView />

        {/* FORECAST VIEW */}
        <ForecastView />

        {/* FIXED VIEW */}
        <FixedView />

        {/* NET WORTH VIEW */}
        <NetWorthView />

        {/* AI VIEW */}
        <AIView />

        {/* PROFILE VIEW */}
        <ProfileView />
      </main>

      <AISidePanel />

      <FileSetupModal />
      <OnboardingModal />
      <ModelSetupModal />

      {/* Floating AI refs (hidden — replaced by ai-side-panel) */}
      <div id="ai-float" style={{ display: 'none' }}>
        <div id="ai-float-panel"><div id="af-quick"></div><input id="af-input" type="text" /><button id="af-ask-btn"></button><div id="af-response"></div></div>
      </div>

      <NotificationPanel />
      <TxSlidePanel />
      <CommandPalette />
      <SubscriptionReviewModal />
      <CSVModal />
    </div>
  )
}

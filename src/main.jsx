import React from 'react'
import ReactDOM from 'react-dom/client'
import Chart from 'chart.js/auto'
import '@fontsource/dm-sans/300.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import { SankeyController, Flow } from 'chartjs-chart-sankey'
import './bridge.js'
import './ai/index.js'
import App from './App'

Chart.register(SankeyController, Flow)
window.Chart = Chart

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

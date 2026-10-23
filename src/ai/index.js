// Wires the AI assistant into the app. React components and data-action
// strings call these through window.* (see CLAUDE.md, gotcha #1).
import { CURATED_MODELS, DEFAULT_MODEL, suggestedModelId, curatedById } from './models.js'
import {
  OLLAMA_DEFAULT_URL, CUSTOM_DEFAULT_URL, parseLoopbackUrl, ollamaStatus, pullOllamaModel,
  listOpenAIModels, chatComplete, describeProvider,
} from './providers.js'
import {
  askFromPage, askFromPanel, explainThis, monthlyReview, newConversation, saveReview,
  completeOnce, quickPrompts, renderThreads, currentSnapshot,
} from './chat.js'
import { renderAIText } from './prompts.js'

const isDesktop = () => typeof window.__TAURI__ !== 'undefined'

function save() {
  window.saveData?.()
  document.dispatchEvent(new CustomEvent('ks:ai-render'))
  window.renderAIPanel?.()
}

// Default AI settings for this runtime; also repairs settings saved by older
// versions (cloud providers, WebLLM, old model ids).
export function normalizeAISettings(s) {
  if (!s) return s
  const valid = ['ollama', 'openai', 'llamacpp']
  if (!valid.includes(s.aiProvider) || (s.aiProvider === 'llamacpp' && !isDesktop())) {
    s.aiProvider = isDesktop() ? 'llamacpp' : 'ollama'
    s.aiModel = isDesktop() ? DEFAULT_MODEL.id : DEFAULT_MODEL.ollamaTag
  }
  if (s.aiProvider === 'llamacpp' && !curatedById(s.aiModel)) s.aiModel = DEFAULT_MODEL.id
  if (s.aiProvider === 'llamacpp') s.aiModel = curatedById(s.aiModel).id
  if (!s.ollamaUrl) s.ollamaUrl = OLLAMA_DEFAULT_URL
  if (!s.localEndpoint) s.localEndpoint = CUSTOM_DEFAULT_URL
  delete s.providerKeys
  delete s.apiKey
  delete s.plaidConnections
  delete s.autoCheckUpdates
  delete s.lastUpdateCheck
  return s
}

function setProvider(provider) {
  const s = window.state?.settings
  if (!s) return
  s.aiProvider = provider
  if (provider === 'llamacpp') s.aiModel = curatedById(s.aiModel)?.id || DEFAULT_MODEL.id
  else if (provider === 'ollama') s.aiModel = curatedById(s.aiModel)?.ollamaTag || s.aiModel || DEFAULT_MODEL.ollamaTag
  else s.aiModel = ''
  save()
}

function setModel(model) {
  const s = window.state?.settings
  if (!s) return
  s.aiModel = model
  save()
}

function setLocalEndpoint(url) {
  const s = window.state?.settings
  if (!s) return
  parseLoopbackUrl(url) // throws with a friendly message if not on this computer
  s.localEndpoint = url.trim().replace(/\/+$/, '')
  save()
}

// Download progress is broadcast so the settings page can show a bar.
const pulls = {}
async function installOllamaModel(tag) {
  if (pulls[tag]) return
  pulls[tag] = { status: 'starting', completed: 0, total: 0 }
  const emit = () => document.dispatchEvent(new CustomEvent('ks:ollama-progress', { detail: { tag, ...pulls[tag] } }))
  emit()
  try {
    await pullOllamaModel(window.state?.settings?.ollamaUrl || OLLAMA_DEFAULT_URL, tag, evt => {
      pulls[tag] = { status: evt.status || '', completed: evt.completed || pulls[tag].completed, total: evt.total || pulls[tag].total }
      emit()
    })
    pulls[tag] = { status: 'done', completed: 1, total: 1 }
    emit()
    window.showToast?.(`${tag} is installed`)
  } catch (e) {
    pulls[tag] = { status: 'error', error: e.message }
    emit()
    window.showToast?.(`Could not install ${tag}: ${e.message}`, 5000, 'error')
  } finally {
    setTimeout(() => { delete pulls[tag] }, 1500)
  }
}

async function testConnection() {
  const s = window.state?.settings || {}
  const reply = await chatComplete({ settings: s, messages: [{ role: 'user', content: 'Reply with the single word: ready' }], maxTokens: 8 })
  return reply
}

window.CURATED_MODELS = CURATED_MODELS
window.suggestedModelId = () => suggestedModelId(navigator.deviceMemory)
window.describeAIProvider = () => describeProvider(window.state?.settings || {})
window.normalizeAISettings = normalizeAISettings
window.aiSetProvider = setProvider
window.aiSetModel = setModel
window.aiSetLocalEndpoint = setLocalEndpoint
window.ollamaStatus = () => ollamaStatus(window.state?.settings?.ollamaUrl || OLLAMA_DEFAULT_URL)
window.installOllamaModel = installOllamaModel
window.getOllamaPulls = () => ({ ...pulls })
window.listLocalServerModels = base => listOpenAIModels(base || window.state?.settings?.localEndpoint || CUSTOM_DEFAULT_URL)
window.testAIConnection = testConnection

window.askAI = askFromPage
window.askAIPanel = askFromPanel
window.askAIRaw = prompt => completeOnce(prompt)
window.askAINarrative = monthlyReview
window.askAIForecast = () => explainThis('forecast')
window.explainThis = explainThis
window.newAIConversation = newConversation
window.saveCFOReview = saveReview
window.getAIQuickPrompts = quickPrompts
window.renderAIThreads = renderThreads
window.renderAIText = renderAIText
window.getAISnapshot = currentSnapshot

// Repair settings saved by older versions as soon as state exists.
if (window.state?.settings) normalizeAISettings(window.state.settings)

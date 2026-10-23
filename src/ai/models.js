// Curated local models, chosen by measurement (`npm run eval:models`) on a
// 4-core CPU-only laptop, 2026-10-22:
//   Llama 3.2 3B — 100% of quoted figures correct, ~31 s/answer, follow-ups start in ~1 s
//   Qwen3.5 4B   — 100% correct and most detailed, ~78 s/answer, follow-ups ~10 s
//   (Qwen3.5 2B was dropped: slower and less accurate, 90%, than Llama 3.2 3B.)
// Web: installed through Ollama (`ollamaTag`). Desktop: the GGUF file is
// downloaded from Hugging Face and run by the bundled llama.cpp.
// Licenses: Qwen3.5 Apache-2.0; Llama 3.2 Community License.
export const CURATED_MODELS = [
  {
    id: 'llama3.2-3b',
    tier: 'Fast',
    name: 'Llama 3.2 3B',
    blurb: 'Quickest answers; best for older laptops or 8 GB of RAM',
    ollamaTag: 'llama3.2:3b',
    ollamaSize: '~2 GB',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeMb: 2019,
    minRamGb: 0,
  },
  {
    id: 'qwen3.5-4b',
    tier: 'Recommended',
    name: 'Qwen3.5 4B',
    blurb: 'Best balance for most laptops (8–16 GB RAM)',
    ollamaTag: 'qwen3.5:4b',
    ollamaSize: '~3.5 GB',
    filename: 'Qwen3.5-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    sizeMb: 2741,
    minRamGb: 8,
    recommended: true,
  },
  {
    id: 'qwen3.5-9b',
    tier: 'Best quality',
    name: 'Qwen3.5 9B',
    blurb: 'Sharpest answers; needs 16 GB+ RAM',
    ollamaTag: 'qwen3.5:9b',
    ollamaSize: '~7 GB',
    filename: 'Qwen3.5-9B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf',
    sizeMb: 5681,
    minRamGb: 16,
  },
]

export const DEFAULT_MODEL = CURATED_MODELS.find(m => m.recommended)

// navigator.deviceMemory is a coarse hint (capped at 8 in most browsers).
// Returns the id of the tier to suggest, or the recommended one if unknown.
export function suggestedModelId(deviceMemoryGb) {
  if (!deviceMemoryGb) return DEFAULT_MODEL.id
  if (deviceMemoryGb < 8) return 'llama3.2-3b'
  return DEFAULT_MODEL.id
}

export function curatedById(id) {
  return CURATED_MODELS.find(m => m.id === id || m.ollamaTag === id) || null
}

// Leaf module: the Ollama base URL, shared by ollama-client + ollama-manager
// without importing each other (breaks the ollama-client ↔ ollama-manager cycle).
export const OLLAMA_BASE_URL = 'http://localhost:11434'

import { openCoreDb } from '../../src/db.js'
import { createProfile } from '../../src/providers/store.js'

export function seedDefaultProvider (dataDir: string): void {
  const db = openCoreDb(dataDir)
  try {
    createProfile(db, {
      displayName: 'Local',
      providerId: 'openai-compatible',
      modelId: 'local-model',
      baseUrl: 'http://127.0.0.1:1234/v1',
      isDefault: true
    })
  } finally {
    db.close()
  }
}

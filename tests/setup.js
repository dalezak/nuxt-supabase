import { vi } from 'vitest'
import { ref } from 'vue'

vi.stubGlobal('consoleLog', vi.fn())
vi.stubGlobal('consoleWarn', vi.fn())
vi.stubGlobal('consoleError', vi.fn())

// Nuxt auto-imports Vue's reactivity API; plain vitest doesn't. User.js pulls
// in use-auth-session, which calls ref() at module load.
vi.stubGlobal('ref', ref)

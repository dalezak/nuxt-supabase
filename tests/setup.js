import { vi } from 'vitest'

vi.stubGlobal('consoleLog', vi.fn())
vi.stubGlobal('consoleWarn', vi.fn())
vi.stubGlobal('consoleError', vi.fn())

import { describe, it, expect, vi, beforeEach } from 'vitest'
import User from '../app/models/User.js'

function makeAuth(overrides = {}) {
  return {
    signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: { message: 'error' } }),
    signUp: vi.fn().mockResolvedValue({ data: null, error: { message: 'error' } }),
    signOut: vi.fn().mockResolvedValue({}),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: null, error: { message: 'error' } }),
    updateUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'error' } }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

const authUser = { id: 'user-1', email: 'alice@example.com', created_at: '2024-01-01', updated_at: '2024-01-02' }

beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { url: 'https://app.example.com' } }))
})

describe('User.login()', () => {
  it('returns a User instance on success', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({
      auth: makeAuth({ signInWithPassword: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }) })
    }))
    const user = await User.login('alice@example.com', 'secret')
    expect(user).toBeInstanceOf(User)
    expect(user.id).toBe('user-1')
    expect(user.email).toBe('alice@example.com')
  })

  it('passes email and password to signInWithPassword', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: authUser }, error: null })
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth({ signInWithPassword }) }))
    await User.login('alice@example.com', 'secret')
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'secret' })
  })

  it('returns null on auth error', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth() }))
    const user = await User.login('alice@example.com', 'wrong')
    expect(user).toBeNull()
  })

  it('returns null when no user is returned', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({
      auth: makeAuth({ signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }) })
    }))
    const user = await User.login('alice@example.com', 'secret')
    expect(user).toBeNull()
  })
})

describe('User.signup()', () => {
  it('returns a User instance with name on success', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({
      auth: makeAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }) })
    }))
    const user = await User.signup('alice@example.com', 'secret', 'Alice')
    expect(user).toBeInstanceOf(User)
    expect(user.id).toBe('user-1')
    expect(user.name).toBe('Alice')
  })

  it('throws the auth error so callers can match on code/message', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth() }))
    await expect(User.signup('alice@example.com', 'secret', 'Alice'))
      .rejects.toThrow()
  })
})

describe('User.logout()', () => {
  it('clears storage and signs out, returning true', async () => {
    const mockClear = vi.fn().mockResolvedValue(true)
    const signOut = vi.fn().mockResolvedValue({})
    vi.stubGlobal('useStorage', () => ({ clear: mockClear }))
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth({ signOut }) }))

    const result = await User.logout()

    expect(mockClear).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()
    expect(result).toBe(true)
  })

  it('returns false when an error is thrown', async () => {
    vi.stubGlobal('useStorage', () => ({ clear: vi.fn().mockRejectedValue(new Error('Storage error')) }))
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth() }))

    const result = await User.logout()
    expect(result).toBe(false)
  })
})

describe('User.resetPassword()', () => {
  it('returns true on success', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null })
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth({ resetPasswordForEmail }) }))

    const result = await User.resetPassword('alice@example.com')
    expect(result).toBe(true)
  })

  it('includes the correct redirectTo URL', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null })
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth({ resetPasswordForEmail }) }))

    await User.resetPassword('alice@example.com')
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ redirectTo: 'https://app.example.com/reset?email=alice@example.com' })
    )
  })

  it('returns false on error', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth() }))
    const result = await User.resetPassword('alice@example.com')
    expect(result).toBe(false)
  })
})

describe('User.updatePassword()', () => {
  it('returns true on success', async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: authUser }, error: null })
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth({ updateUser }) }))

    const result = await User.updatePassword('newpassword')
    expect(result).toBe(true)
  })

  it('passes the password to updateUser', async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: authUser }, error: null })
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth({ updateUser }) }))

    await User.updatePassword('newpassword')
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword' })
  })

  it('returns false on error', async () => {
    vi.stubGlobal('useSupabaseClient', () => ({ auth: makeAuth() }))
    const result = await User.updatePassword('newpassword')
    expect(result).toBe(false)
  })
})

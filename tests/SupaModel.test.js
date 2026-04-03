import { describe, it, expect, vi, beforeEach } from 'vitest'
import SupaModel from '../app/models/SupaModel.js'

// Chainable Supabase query builder mock.
// Every method returns the builder itself so chains like
// .from().upsert().eq().select() all resolve to `result` when awaited.
function makeBuilder(result) {
  const b = {}
  for (const method of [
    'select', 'range', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte',
    'ilike', 'like', 'is', 'in', 'cs', 'cd', 'order',
    'upsert', 'insert', 'delete', 'single',
  ]) {
    b[method] = vi.fn().mockReturnValue(b)
  }
  b.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)
  return b
}

class TestModel extends SupaModel {
  id = null
  name = null
  email = null
  constructor(data = {}) {
    super(data)
    Object.assign(this, data)
  }
  async save() {
    return this.saveModel(TestModel, 'tests', ['name', 'email'])
  }
}

let builder
let mockSupabase

beforeEach(() => {
  builder = makeBuilder({ data: null, error: null })
  mockSupabase = { from: vi.fn().mockReturnValue(builder) }
  vi.stubGlobal('useSupabaseClient', () => mockSupabase)
})

describe('SupaModel.saveModel()', () => {
  it('takes the insert path when id is null', async () => {
    const row = { id: 'new-id', name: 'Alice', email: 'alice@example.com' }
    builder = makeBuilder({ data: [row], error: null })
    mockSupabase.from.mockReturnValue(builder)

    const model = new TestModel({ name: 'Alice', email: 'alice@example.com' })
    const result = await model.saveModel(TestModel, 'tests', ['name', 'email'])

    expect(builder.insert).toHaveBeenCalledOnce()
    expect(builder.upsert).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(TestModel)
    expect(result.id).toBe('new-id')
  })

  it('takes the upsert path when id is set', async () => {
    const row = { id: 'existing-id', name: 'Alice', email: 'alice@example.com' }
    builder = makeBuilder({ data: [row], error: null })
    mockSupabase.from.mockReturnValue(builder)

    const model = new TestModel({ id: 'existing-id', name: 'Alice', email: 'alice@example.com' })
    const result = await model.saveModel(TestModel, 'tests', ['name', 'email'])

    expect(builder.upsert).toHaveBeenCalledOnce()
    expect(builder.insert).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(TestModel)
    expect(result.id).toBe('existing-id')
  })

  it('applies eq() for each key on the upsert path', async () => {
    const row = { id: 'abc', name: 'Alice', email: 'alice@example.com' }
    builder = makeBuilder({ data: [row], error: null })
    mockSupabase.from.mockReturnValue(builder)

    const model = new TestModel({ id: 'abc', name: 'Alice', email: 'alice@example.com' })
    await model.saveModel(TestModel, 'tests', ['name', 'email'], ['id'])

    expect(builder.eq).toHaveBeenCalledWith('id', 'abc')
  })

  it('returns null and does not throw on error', async () => {
    builder = makeBuilder({ data: null, error: { message: 'DB error' } })
    mockSupabase.from.mockReturnValue(builder)

    const model = new TestModel({ name: 'Alice' })
    const result = await model.saveModel(TestModel, 'tests', ['name'])

    expect(result).toBeNull()
  })
})

describe('SupaModel.loadModel()', () => {
  it('returns a model instance when a row is found', async () => {
    const row = { id: '1', name: 'Alice', email: 'alice@example.com' }
    builder = makeBuilder({ data: row, error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.loadModel(TestModel, 'tests', { id: '1' })

    expect(mockSupabase.from).toHaveBeenCalledWith('tests')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.eq).toHaveBeenCalledWith('id', '1')
    expect(result).toBeInstanceOf(TestModel)
    expect(result.name).toBe('Alice')
  })

  it('applies eq() for every where key', async () => {
    builder = makeBuilder({ data: { id: '1', name: 'Alice', email: 'alice@example.com' }, error: null })
    mockSupabase.from.mockReturnValue(builder)

    await SupaModel.loadModel(TestModel, 'tests', { id: '1', email: 'alice@example.com' })

    expect(builder.eq).toHaveBeenCalledWith('id', '1')
    expect(builder.eq).toHaveBeenCalledWith('email', 'alice@example.com')
  })

  it('returns null when no row is found (PGRST116)', async () => {
    builder = makeBuilder({ data: null, error: { code: 'PGRST116' } })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.loadModel(TestModel, 'tests', { id: 'missing' })
    expect(result).toBeNull()
  })

  it('returns null on other errors', async () => {
    builder = makeBuilder({ data: null, error: { code: '500', message: 'Server error' } })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.loadModel(TestModel, 'tests', { id: '1' })
    expect(result).toBeNull()
  })
})

describe('SupaModel.deleteModel()', () => {
  it('applies eq() for each where key and returns true on success', async () => {
    builder = makeBuilder({ error: null })
    mockSupabase.from.mockReturnValue(builder)

    const model = new TestModel({ id: '1' })
    const result = await model.deleteModel(TestModel, 'tests', { id: '1' })

    expect(builder.eq).toHaveBeenCalledWith('id', '1')
    expect(builder.delete).toHaveBeenCalledOnce()
    expect(result).toBe(true)
  })

  it('returns false when where is empty', async () => {
    const model = new TestModel({ id: '1' })
    const result = await model.deleteModel(TestModel, 'tests', {})
    expect(result).toBe(false)
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('returns false on error', async () => {
    builder = makeBuilder({ error: { message: 'DB error' } })
    mockSupabase.from.mockReturnValue(builder)

    const model = new TestModel({ id: '1' })
    const result = await model.deleteModel(TestModel, 'tests', { id: '1' })
    expect(result).toBe(false)
  })
})

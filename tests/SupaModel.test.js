import { describe, it, expect, vi, beforeEach } from 'vitest'
import SupaModel from '../app/models/SupaModel.js'

// Chainable Supabase query builder mock.
// Every method returns the builder itself so chains like
// .from().upsert().eq().select() all resolve to `result` when awaited.
function makeBuilder(result) {
  const b = {}
  for (const method of [
    'select', 'range', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte',
    'ilike', 'like', 'is', 'in', 'cs', 'cd', 'not', 'order', 'limit', 'or',
    'upsert', 'insert', 'delete', 'single', 'maybeSingle',
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

describe('SupaModel.upsertModel()', () => {
  it('upserts and returns nothing by default', async () => {
    builder = makeBuilder({ error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.upsertModel('tests', { id: '1', name: 'Alice' }, 'id')

    expect(builder.upsert).toHaveBeenCalledWith({ id: '1', name: 'Alice' }, { onConflict: 'id', ignoreDuplicates: false })
    expect(builder.select).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('accepts legacy positional ignoreDuplicates boolean (back-compat)', async () => {
    builder = makeBuilder({ error: null })
    mockSupabase.from.mockReturnValue(builder)

    await SupaModel.upsertModel('tests', { id: '1' }, 'id', true)

    expect(builder.upsert).toHaveBeenCalledWith({ id: '1' }, { onConflict: 'id', ignoreDuplicates: true })
  })

  it('returns the upserted row when { returning: true }', async () => {
    const row = { id: '1', name: 'Alice' }
    builder = makeBuilder({ data: row, error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.upsertModel('tests', row, 'id', { returning: true })

    expect(builder.upsert).toHaveBeenCalled()
    expect(builder.select).toHaveBeenCalled()
    expect(builder.single).toHaveBeenCalled()
    expect(result).toEqual(row)
  })

  it('combines ignoreDuplicates + returning via options object', async () => {
    const row = { id: '1', name: 'Alice' }
    builder = makeBuilder({ data: row, error: null })
    mockSupabase.from.mockReturnValue(builder)

    await SupaModel.upsertModel('tests', row, 'id', { ignoreDuplicates: true, returning: true })

    expect(builder.upsert).toHaveBeenCalledWith(row, { onConflict: 'id', ignoreDuplicates: true })
    expect(builder.select).toHaveBeenCalled()
  })
})

describe('SupaModel.insertModel()', () => {
  it('inserts and returns nothing by default', async () => {
    builder = makeBuilder({ error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.insertModel('tests', { name: 'Alice' })

    expect(builder.insert).toHaveBeenCalledWith({ name: 'Alice' })
    expect(builder.select).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('returns the inserted row when { returning: true }', async () => {
    const row = { id: 'new-id', name: 'Alice' }
    builder = makeBuilder({ data: row, error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.insertModel('tests', { name: 'Alice' }, { returning: true })

    expect(builder.insert).toHaveBeenCalledWith({ name: 'Alice' })
    expect(builder.select).toHaveBeenCalled()
    expect(builder.single).toHaveBeenCalled()
    expect(result).toEqual(row)
  })

  it('throws on error in either mode', async () => {
    builder = makeBuilder({ error: { message: 'DB error' } })
    mockSupabase.from.mockReturnValue(builder)

    await expect(SupaModel.insertModel('tests', { name: 'Alice' })).rejects.toBeDefined()
  })
})

describe('SupaModel.findModel()', () => {
  it('uses maybeSingle and returns a model when a row is found', async () => {
    const row = { id: '1', name: 'Alice', email: 'alice@example.com' }
    builder = makeBuilder({ data: row, error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.findModel(TestModel, 'tests', { email: 'alice@example.com' })

    expect(builder.eq).toHaveBeenCalledWith('email', 'alice@example.com')
    expect(builder.maybeSingle).toHaveBeenCalledOnce()
    expect(result).toBeInstanceOf(TestModel)
    expect(result.name).toBe('Alice')
  })

  it('returns null when no row matches', async () => {
    builder = makeBuilder({ data: null, error: null })
    mockSupabase.from.mockReturnValue(builder)

    const result = await SupaModel.findModel(TestModel, 'tests', { email: 'nope@example.com' })
    expect(result).toBeNull()
  })

  it('applies order + limit(1) when order option supplied', async () => {
    builder = makeBuilder({ data: { id: '1', name: 'Alice' }, error: null })
    mockSupabase.from.mockReturnValue(builder)

    await SupaModel.findModel(TestModel, 'tests', { name: 'Alice' }, { order: 'created_at:desc' })

    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(1)
  })

  it('does not apply order/limit when order option omitted', async () => {
    builder = makeBuilder({ data: { id: '1', name: 'Alice' }, error: null })
    mockSupabase.from.mockReturnValue(builder)

    await SupaModel.findModel(TestModel, 'tests', { name: 'Alice' })

    expect(builder.order).not.toHaveBeenCalled()
    expect(builder.limit).not.toHaveBeenCalled()
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

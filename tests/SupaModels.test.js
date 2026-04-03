import { describe, it, expect, vi, beforeEach } from 'vitest'
import SupaModel from '../app/models/SupaModel.js'
import SupaModels from '../app/models/SupaModels.js'

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
  constructor(data = {}) {
    super(data)
    Object.assign(this, data)
  }
}

class TestCollection extends SupaModels {
  constructor(models = []) {
    super(TestModel, models)
  }
}

let builder
let mockSupabase

beforeEach(() => {
  builder = makeBuilder({ data: [], error: null })
  mockSupabase = { from: vi.fn().mockReturnValue(builder) }
  vi.stubGlobal('useSupabaseClient', () => mockSupabase)
})

describe('SupaModels.loadModels()', () => {
  it('queries the correct table and applies range', async () => {
    await SupaModels.loadModels(TestCollection, TestModel, 'tests', { limit: 5, offset: 10 })

    expect(mockSupabase.from).toHaveBeenCalledWith('tests')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.range).toHaveBeenCalledWith(10, 14)
  })

  it('returns a collection populated with model instances', async () => {
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]
    builder = makeBuilder({ data: rows, error: null })
    mockSupabase.from.mockReturnValue(builder)

    const collection = await SupaModels.loadModels(TestCollection, TestModel, 'tests')

    expect(collection).toHaveLength(2)
    expect(collection[0]).toBeInstanceOf(TestModel)
    expect(collection[0].name).toBe('Alice')
    expect(collection[1].name).toBe('Bob')
  })

  it('returns an empty collection on error', async () => {
    builder = makeBuilder({ data: null, error: { message: 'DB error' } })
    mockSupabase.from.mockReturnValue(builder)

    const collection = await SupaModels.loadModels(TestCollection, TestModel, 'tests')
    expect(collection).toHaveLength(0)
  })

  describe('where clause operators', () => {
    const operators = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'ilike', 'like', 'is', 'in', 'cs', 'cd']

    for (const op of operators) {
      it(`applies ${op} operator`, async () => {
        await SupaModels.loadModels(TestCollection, TestModel, 'tests', {
          where: [['name', op, 'Alice']],
        })
        expect(builder[op]).toHaveBeenCalledWith('name', op === 'ilike' || op === 'like' ? '%Alice%' : 'Alice')
      })
    }

    it('applies multiple where clauses', async () => {
      await SupaModels.loadModels(TestCollection, TestModel, 'tests', {
        where: [['name', 'eq', 'Alice'], ['id', 'neq', '99']],
      })
      expect(builder.eq).toHaveBeenCalledWith('name', 'Alice')
      expect(builder.neq).toHaveBeenCalledWith('id', '99')
    })
  })

  describe('order clause', () => {
    it('applies ascending order', async () => {
      await SupaModels.loadModels(TestCollection, TestModel, 'tests', { order: 'name:asc' })
      expect(builder.order).toHaveBeenCalledWith('name', { ascending: true })
    })

    it('applies descending order', async () => {
      await SupaModels.loadModels(TestCollection, TestModel, 'tests', { order: 'created_at:desc' })
      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('does not call order when not specified', async () => {
      await SupaModels.loadModels(TestCollection, TestModel, 'tests')
      expect(builder.order).not.toHaveBeenCalled()
    })
  })

  it('uses custom select fields', async () => {
    await SupaModels.loadModels(TestCollection, TestModel, 'tests', { select: 'id, name' })
    expect(builder.select).toHaveBeenCalledWith('id, name')
  })
})

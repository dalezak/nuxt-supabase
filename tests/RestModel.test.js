import { describe, it, expect, vi, beforeEach } from 'vitest'
import RestModel from '../app/models/RestModel.js'
import RestModels from '../app/models/RestModels.js'

class TestModel extends RestModel {
  constructor(data = {}) {
    super(data)
    Object.assign(this, data)
  }
}

class TestCollection extends RestModels {
  constructor(models = []) {
    super(TestModel, models)
  }
}

// useFetch returns { data: Ref, error: Ref } — mock returns plain objects with .value
function mockFetch(responseValue, errorValue = null) {
  vi.stubGlobal('useFetch', vi.fn().mockResolvedValue({
    data: { value: responseValue },
    error: { value: errorValue },
  }))
}

describe('RestModel.urlQuery()', () => {
  it('returns the URL unchanged when params is empty', () => {
    const result = RestModel.urlQuery('https://api.example.com/items')
    expect(result).toBe('https://api.example.com/items')
  })

  it('appends params as query string', () => {
    const result = RestModel.urlQuery('https://api.example.com/items', { limit: '10', page: '2' })
    const url = new URL(result)
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('preserves existing query params on the base URL', () => {
    const result = RestModel.urlQuery('https://api.example.com/items?sort=asc', { limit: '5' })
    const url = new URL(result)
    expect(url.searchParams.get('sort')).toBe('asc')
    expect(url.searchParams.get('limit')).toBe('5')
  })
})

describe('RestModel.loadModel()', () => {
  it('returns a model instance on success', async () => {
    mockFetch({ id: 1, name: 'Alice' })
    const result = await RestModel.loadModel(TestModel, 'https://api.example.com/items/1')
    expect(result).toBeInstanceOf(TestModel)
    expect(result.name).toBe('Alice')
  })

  it('passes params to useFetch', async () => {
    mockFetch({ id: 1, name: 'Alice' })
    await RestModel.loadModel(TestModel, 'https://api.example.com/items/1', { include: 'profile' })
    expect(global.useFetch).toHaveBeenCalledWith(
      'https://api.example.com/items/1',
      expect.objectContaining({ params: { include: 'profile' } })
    )
  })

  it('returns null on error', async () => {
    mockFetch(null, { message: 'Not found' })
    const result = await RestModel.loadModel(TestModel, 'https://api.example.com/items/99')
    expect(result).toBeNull()
  })

  it('returns null when response is empty', async () => {
    mockFetch(null)
    const result = await RestModel.loadModel(TestModel, 'https://api.example.com/items/1')
    expect(result).toBeNull()
  })
})

describe('RestModel.saveModel()', () => {
  it('uses POST when id is null (insert)', async () => {
    mockFetch({ id: 1, name: 'Alice' })
    const m = new TestModel({ name: 'Alice' }) // id is undefined → null check
    await m.saveModel(TestModel, 'https://api.example.com/items', { name: 'Alice' })
    expect(global.useFetch).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({ method: 'post' })
    )
  })

  it('uses PUT when id is set (update)', async () => {
    mockFetch({ id: 1, name: 'Alice' })
    const m = new TestModel({ id: 1, name: 'Alice' })
    await m.saveModel(TestModel, 'https://api.example.com/items/1', { name: 'Alice' })
    expect(global.useFetch).toHaveBeenCalledWith(
      'https://api.example.com/items/1',
      expect.objectContaining({ method: 'put' })
    )
  })

  it('returns a model instance on success', async () => {
    mockFetch({ id: 1, name: 'Alice' })
    const m = new TestModel({ id: 1, name: 'Alice' })
    const result = await m.saveModel(TestModel, 'https://api.example.com/items/1', { name: 'Alice' })
    expect(result).toBeInstanceOf(TestModel)
    expect(result.id).toBe(1)
  })

  it('returns null on error', async () => {
    mockFetch(null, { message: 'Server error' })
    const m = new TestModel({ id: 1 })
    const result = await m.saveModel(TestModel, 'https://api.example.com/items/1', {})
    expect(result).toBeNull()
  })
})

describe('RestModel.deleteModel()', () => {
  it('returns true on success', async () => {
    mockFetch({ success: true })
    const m = new TestModel({ id: 1 })
    const result = await m.deleteModel(TestModel, 'https://api.example.com/items/1')
    expect(global.useFetch).toHaveBeenCalledWith(
      'https://api.example.com/items/1',
      expect.objectContaining({ method: 'delete' })
    )
    expect(result).toBe(true)
  })

  it('returns false on error', async () => {
    mockFetch(null, { message: 'Not found' })
    const m = new TestModel({ id: 1 })
    const result = await m.deleteModel(TestModel, 'https://api.example.com/items/1')
    expect(result).toBe(false)
  })

  it('returns false when response is empty', async () => {
    mockFetch(null)
    const m = new TestModel({ id: 1 })
    const result = await m.deleteModel(TestModel, 'https://api.example.com/items/1')
    expect(result).toBe(false)
  })
})

describe('RestModels.urlQuery()', () => {
  it('returns the URL unchanged when params is empty', () => {
    const result = RestModels.urlQuery('https://api.example.com/items')
    expect(result).toBe('https://api.example.com/items')
  })

  it('appends params as query string', () => {
    const result = RestModels.urlQuery('https://api.example.com/items', { limit: '10' })
    const url = new URL(result)
    expect(url.searchParams.get('limit')).toBe('10')
  })

  it('handles null params gracefully', () => {
    const result = RestModels.urlQuery('https://api.example.com/items', null)
    expect(result).toBe('https://api.example.com/items')
  })
})

describe('RestModels.loadModels()', () => {
  it('returns a populated collection on success', async () => {
    mockFetch([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])
    const collection = await RestModels.loadModels(TestCollection, TestModel, 'https://api.example.com/items')
    expect(collection).toHaveLength(2)
    expect(collection[0]).toBeInstanceOf(TestModel)
    expect(collection[0].name).toBe('Alice')
  })

  it('returns null on error', async () => {
    mockFetch(null, { message: 'Server error' })
    const result = await RestModels.loadModels(TestCollection, TestModel, 'https://api.example.com/items')
    expect(result).toBeNull()
  })

  it('returns an empty collection when response is empty', async () => {
    mockFetch(null)
    const collection = await RestModels.loadModels(TestCollection, TestModel, 'https://api.example.com/items')
    expect(collection).toHaveLength(0)
  })
})

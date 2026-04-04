import { describe, it, expect, vi, beforeEach } from 'vitest'
import Model from '../app/models/Model.js'

describe('Model', () => {

  describe('getAttributes()', () => {
    it('excludes id', () => {
      const m = new Model({ id: '1', name: 'Alice' })
      expect(m.getAttributes()).not.toContain('id')
      expect(m.getAttributes()).toContain('name')
    })

    it('excludes _at suffixed fields', () => {
      const m = new Model({ name: 'Alice', created_at: '2024-01-01', updated_at: '2024-01-02' })
      expect(m.getAttributes()).not.toContain('created_at')
      expect(m.getAttributes()).not.toContain('updated_at')
      expect(m.getAttributes()).toContain('name')
    })

    it('excludes _count suffixed fields', () => {
      const m = new Model({ name: 'Alice', likes_count: 5, comments_count: 2 })
      expect(m.getAttributes()).not.toContain('likes_count')
      expect(m.getAttributes()).not.toContain('comments_count')
      expect(m.getAttributes()).toContain('name')
    })

    it('allows subclass to extend excludedAttributes', () => {
      class Sub extends Model {
        get excludedAttributes() { return [...super.excludedAttributes, 'secret'] }
      }
      const m = new Sub({ name: 'Alice', secret: 'token' })
      expect(m.getAttributes()).not.toContain('secret')
      expect(m.getAttributes()).toContain('name')
    })

    it('allows subclass to remove _at exclusion via excludedSuffixes', () => {
      class Sub extends Model {
        get excludedSuffixes() { return ['_count'] }
      }
      const m = new Sub({ name: 'Alice', updated_at: '2024-01-01', likes_count: 3 })
      expect(m.getAttributes()).toContain('updated_at')
      expect(m.getAttributes()).not.toContain('likes_count')
    })
  })

  describe('getValues()', () => {
    it('returns only non-null values for specified attributes by default', () => {
      const m = new Model({ name: 'Alice', email: null })
      expect(m.getValues(['name', 'email'])).toEqual({ name: 'Alice' })
    })

    it('includes null values when includeNulls is true', () => {
      const m = new Model({ name: 'Alice', email: null })
      expect(m.getValues(['name', 'email'], true)).toEqual({ name: 'Alice', email: null })
    })

    it('falls back to getAttributes() when no attributes given', () => {
      const m = new Model({ id: '1', name: 'Alice', created_at: '2024-01-01' })
      const values = m.getValues()
      expect(values).toHaveProperty('name')
      expect(values).not.toHaveProperty('id')
      expect(values).not.toHaveProperty('created_at')
    })

    it('only returns keys that exist on the model', () => {
      const m = new Model({ name: 'Alice' })
      expect(m.getValues(['name', 'nonexistent'])).toEqual({ name: 'Alice' })
    })

    it('returns empty object when all specified attributes are null', () => {
      const m = new Model({ name: null, email: null })
      expect(m.getValues(['name', 'email'])).toEqual({})
    })

    it('returns all attributes with their values when called with empty array', () => {
      const m = new Model({ name: 'Alice', role: 'admin' })
      const values = m.getValues([])
      expect(values).toEqual({ name: 'Alice', role: 'admin' })
    })
  })

  describe('storeModel()', () => {
    let mockStorage

    beforeEach(() => {
      mockStorage = { set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) }
      vi.stubGlobal('useStorage', () => mockStorage)
    })

    it('persists the model and returns this', async () => {
      const m = new Model({ name: 'Alice' })
      const result = await m.storeModel('test/1')
      expect(mockStorage.set).toHaveBeenCalledWith('test/1', { name: 'Alice' })
      expect(result).toBe(m)
    })

    it('removes from storage and returns null when deleted_at is set', async () => {
      const m = new Model({ name: 'Alice', deleted_at: '2024-01-01T00:00:00Z' })
      const result = await m.storeModel('test/1')
      expect(mockStorage.remove).toHaveBeenCalledWith('test/1')
      expect(mockStorage.set).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('stores a plain JSON copy, not the model instance itself', async () => {
      const m = new Model({ name: 'Alice' })
      await m.storeModel('test/1')
      const stored = mockStorage.set.mock.calls[0][1]
      expect(stored).not.toBe(m)
      expect(stored).toEqual({ name: 'Alice' })
    })
  })

  describe('restoreModel()', () => {
    let mockStorage

    beforeEach(() => {
      mockStorage = { get: vi.fn() }
      vi.stubGlobal('useStorage', () => mockStorage)
    })

    it('returns a model instance when data is found in storage', async () => {
      mockStorage.get.mockResolvedValue({ id: '1', name: 'Alice' })
      const result = await Model.restoreModel(Model, 'test/1')
      expect(mockStorage.get).toHaveBeenCalledWith('test/1')
      expect(result).toBeInstanceOf(Model)
      expect(result.name).toBe('Alice')
    })

    it('returns null when no data is found', async () => {
      mockStorage.get.mockResolvedValue(null)
      const result = await Model.restoreModel(Model, 'test/1')
      expect(result).toBeNull()
    })
  })

})

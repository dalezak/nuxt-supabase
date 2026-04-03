import { describe, it, expect, vi, beforeEach } from 'vitest'
import Models from '../app/models/Models.js'

describe('Models', () => {

  describe('constructor()', () => {
    it('instantiates each model with modelClass', () => {
      class Item {
        constructor(data) { Object.assign(this, data) }
      }
      const collection = new Models(Item, [{ name: 'Alice' }, { name: 'Bob' }])
      expect(collection).toHaveLength(2)
      expect(collection[0]).toBeInstanceOf(Item)
      expect(collection[0].name).toBe('Alice')
      expect(collection[1].name).toBe('Bob')
    })

    it('creates an empty collection when models array is empty', () => {
      const collection = new Models(Object, [])
      expect(collection).toHaveLength(0)
    })
  })

  describe('save()', () => {
    it('calls save() on every item', async () => {
      const items = [
        { save: vi.fn().mockResolvedValue(null) },
        { save: vi.fn().mockResolvedValue(null) },
      ]
      const collection = new Models(Object, [])
      items.forEach(item => collection.push(item))

      await collection.save()

      expect(items[0].save).toHaveBeenCalledOnce()
      expect(items[1].save).toHaveBeenCalledOnce()
    })

    it('awaits each item.save() — all complete before save() resolves', async () => {
      const completed = []
      const items = [
        { save: vi.fn(async () => { completed.push(1) }) },
        { save: vi.fn(async () => { completed.push(2) }) },
        { save: vi.fn(async () => { completed.push(3) }) },
      ]
      const collection = new Models(Object, [])
      items.forEach(item => collection.push(item))

      await collection.save()

      expect(completed).toEqual([1, 2, 3])
    })

    it('skips items that do not have a save() method', async () => {
      const withSave = { save: vi.fn().mockResolvedValue(null) }
      const withoutSave = { name: 'no save' }
      const collection = new Models(Object, [])
      collection.push(withSave)
      collection.push(withoutSave)

      await expect(collection.save()).resolves.not.toThrow()
      expect(withSave.save).toHaveBeenCalledOnce()
    })
  })

  describe('store()', () => {
    it('calls store() on every item', async () => {
      const items = [
        { store: vi.fn().mockResolvedValue(null) },
        { store: vi.fn().mockResolvedValue(null) },
      ]
      const collection = new Models(Object, [])
      items.forEach(item => collection.push(item))

      await collection.store()

      expect(items[0].store).toHaveBeenCalledOnce()
      expect(items[1].store).toHaveBeenCalledOnce()
    })

    it('awaits each item.store() — all complete before store() resolves', async () => {
      const completed = []
      const items = [
        { store: vi.fn(async () => { completed.push(1) }) },
        { store: vi.fn(async () => { completed.push(2) }) },
      ]
      const collection = new Models(Object, [])
      items.forEach(item => collection.push(item))

      await collection.store()

      expect(completed).toEqual([1, 2])
    })

    it('skips items that do not have a store() method', async () => {
      const withStore = { store: vi.fn().mockResolvedValue(null) }
      const withoutStore = { name: 'no store' }
      const collection = new Models(Object, [])
      collection.push(withStore)
      collection.push(withoutStore)

      await expect(collection.store()).resolves.not.toThrow()
      expect(withStore.store).toHaveBeenCalledOnce()
    })
  })

  describe('clearModels()', () => {
    it('calls Storage.clear() with the given prefix', async () => {
      const mockStorage = { clear: vi.fn().mockResolvedValue(true) }
      vi.stubGlobal('useStorage', () => mockStorage)

      await Models.clearModels('users')

      expect(mockStorage.clear).toHaveBeenCalledWith('users')
    })

    it('returns the result from Storage.clear()', async () => {
      const mockStorage = { clear: vi.fn().mockResolvedValue(true) }
      vi.stubGlobal('useStorage', () => mockStorage)

      const result = await Models.clearModels('users')
      expect(result).toBe(true)
    })
  })

})

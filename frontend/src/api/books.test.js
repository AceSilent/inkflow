import { describe, expect, it } from 'vitest'
import { bookResourcePath } from './books'

describe('bookResourcePath', () => {
  it('encodes book ids before placing them in route path segments', () => {
    expect(bookResourcePath('delete?smoke#frag')).toBe('/api/v1/books/delete%3Fsmoke%23frag')
    expect(bookResourcePath('雾港 来信')).toBe('/api/v1/books/%E9%9B%BE%E6%B8%AF%20%E6%9D%A5%E4%BF%A1')
  })
})

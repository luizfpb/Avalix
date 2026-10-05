import { describe, expect, it } from 'vitest'
import { deviceLabel } from './device'

describe('deviceLabel', () => {
  it('distingue iPhone, Android e computador', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'))
      .toBe('iPhone · iOS 18.5')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1'))
      .toBe('iPhone · iOS 17.4 · Chrome')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36'))
      .toBe('Android 14 · Samsung Internet')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'))
      .toBe('Windows · Chrome')
  })

  it('sem user agent não inventa aparelho', () => {
    expect(deviceLabel(null)).toBeNull()
    expect(deviceLabel('')).toBeNull()
  })
})

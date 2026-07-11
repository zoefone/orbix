import { describe, expect, it } from 'vitest'
import source from '../sw.ts?raw'

describe('service worker privacy boundary', () => {
    it('does not persist authenticated API responses in shared Cache Storage', () => {
        expect(source).not.toContain("cacheName: 'api-sessions'")
        expect(source).not.toContain("cacheName: 'api-session-detail'")
        expect(source).not.toContain("cacheName: 'api-machines'")
        expect(source).not.toMatch(/registerRoute\([\s\S]*?\/api\//)
        expect(source).toContain("caches.delete(cacheName)")
    })
})

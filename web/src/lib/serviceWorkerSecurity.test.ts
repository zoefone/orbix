import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('service worker privacy boundary', () => {
    it('does not persist authenticated API responses in shared Cache Storage', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/sw.ts'), 'utf8')
        expect(source).not.toContain("cacheName: 'api-sessions'")
        expect(source).not.toContain("cacheName: 'api-session-detail'")
        expect(source).not.toContain("cacheName: 'api-machines'")
        expect(source).not.toMatch(/registerRoute\([\s\S]*?\/api\//)
        expect(source).toContain("caches.delete(cacheName)")
    })
})

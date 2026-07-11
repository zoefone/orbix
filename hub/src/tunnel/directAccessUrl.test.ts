import { describe, expect, it } from 'bun:test'
import { buildDirectAccessUrl } from './directAccessUrl'

describe('buildDirectAccessUrl', () => {
    it('uses the tunnel itself when no external frontend is configured', () => {
        expect(buildDirectAccessUrl('', 'https://relay.example.test/hub-1', 'token:value')).toBe(
            'https://relay.example.test/hub-1/?hub=https%3A%2F%2Frelay.example.test%2Fhub-1&token=token%3Avalue'
        )
    })

    it('uses an explicitly configured external frontend without a double slash', () => {
        expect(buildDirectAccessUrl('https://app.example.test/', 'https://relay.example.test/hub-1', 'secret')).toBe(
            'https://app.example.test/?hub=https%3A%2F%2Frelay.example.test%2Fhub-1&token=secret'
        )
    })
})

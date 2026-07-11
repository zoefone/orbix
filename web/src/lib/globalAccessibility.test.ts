import { describe, expect, it } from 'vitest'
import appSource from '../App.tsx?raw'
import htmlSource from '../../index.html?raw'

describe('global accessibility guardrails', () => {
    it('allows browser and assistive-technology zoom', () => {
        expect(htmlSource).not.toContain('user-scalable=no')
        expect(htmlSource).not.toContain('maximum-scale=1')
        expect(appSource).not.toContain("document.addEventListener('gesturestart'")
        expect(appSource).not.toContain('event.ctrlKey')
    })
})

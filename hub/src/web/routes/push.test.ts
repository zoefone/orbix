import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import type { WebAppEnv } from '../middleware/auth'
import { createPushRoutes } from './push'

function createApp(report: { total: number; sent: number; removed: number; failed: number }) {
    const sendToNamespace = mock(async () => report)
    const store = {
        push: {
            addPushSubscription: mock(() => {}),
            removePushSubscription: mock(() => {})
        }
    }
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('userId', 1)
        c.set('namespace', 'team-a')
        await next()
    })
    app.route('/', createPushRoutes(store as never, 'vapid-public', { sendToNamespace } as never))
    return { app, sendToNamespace }
}

describe('push test route', () => {
    it('sends a recognizable notification to the authenticated namespace', async () => {
        const { app, sendToNamespace } = createApp({ total: 1, sent: 1, removed: 0, failed: 0 })
        const response = await app.request('/push/test', { method: 'POST' })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            report: { total: 1, sent: 1, removed: 0, failed: 0 }
        })
        expect(sendToNamespace).toHaveBeenCalledTimes(1)
        expect(sendToNamespace.mock.calls[0]?.[0]).toBe('team-a')
        expect(sendToNamespace.mock.calls[0]?.[1]).toMatchObject({
            title: 'Orbix notifications are working',
            tag: 'orbix-notification-test',
            data: { type: 'notification-test', url: '/settings' }
        })
    })

    it('reports a missing device subscription instead of claiming success', async () => {
        const { app } = createApp({ total: 0, sent: 0, removed: 0, failed: 0 })
        const response = await app.request('/push/test', { method: 'POST' })
        expect(response.status).toBe(409)
    })

    it('rate limits repeated test notifications per namespace', async () => {
        const { app, sendToNamespace } = createApp({ total: 1, sent: 1, removed: 0, failed: 0 })
        expect((await app.request('/push/test', { method: 'POST' })).status).toBe(200)
        expect((await app.request('/push/test', { method: 'POST' })).status).toBe(429)
        expect(sendToNamespace).toHaveBeenCalledTimes(1)
    })
})

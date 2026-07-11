import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { PushService } from '../../push/pushService'
import type { WebAppEnv } from '../middleware/auth'

const subscriptionSchema = z.object({
    endpoint: z.string().min(1),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1)
    })
})

const unsubscribeSchema = z.object({
    endpoint: z.string().min(1)
})

export function createPushRoutes(store: Store, vapidPublicKey: string, pushService: PushService): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    const lastTestAtByNamespace = new Map<string, number>()

    app.get('/push/vapid-public-key', (c) => {
        return c.json({ publicKey: vapidPublicKey })
    })

    app.post('/push/subscribe', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = subscriptionSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const { endpoint, keys } = parsed.data
        store.push.addPushSubscription(namespace, {
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth
        })

        return c.json({ ok: true })
    })

    app.delete('/push/subscribe', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = unsubscribeSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        store.push.removePushSubscription(namespace, parsed.data.endpoint)
        return c.json({ ok: true })
    })

    app.post('/push/test', async (c) => {
        const namespace = c.get('namespace')
        const now = Date.now()
        const lastTestAt = lastTestAtByNamespace.get(namespace) ?? 0
        if (now - lastTestAt < 10_000) {
            return c.json({ error: 'Please wait before sending another test notification.' }, 429)
        }
        lastTestAtByNamespace.set(namespace, now)

        const report = await pushService.sendToNamespace(namespace, {
            title: 'Orbix notifications are working',
            body: 'This device can receive task, completion, and approval alerts.',
            tag: 'orbix-notification-test',
            requireInteraction: false,
            silent: false,
            data: {
                type: 'notification-test',
                sessionId: '',
                url: '/settings'
            }
        })

        if (report.total === 0) {
            return c.json({ error: 'No push subscription is registered for this account.', report }, 409)
        }
        if (report.sent === 0) {
            return c.json({ error: 'The test notification could not be delivered.', report }, 502)
        }
        return c.json({ ok: true, report })
    })

    return app
}

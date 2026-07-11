import * as webPush from 'web-push'
import type { Store } from '../store'
import type { VapidKeys } from '../config/vapidKeys'

export type PushPayload = {
    title: string
    body: string
    tag?: string
    requireInteraction?: boolean
    silent?: boolean
    data?: {
        type: string
        sessionId: string
        url: string
    }
}

export type PushDeliveryReport = {
    total: number
    sent: number
    removed: number
    failed: number
}

type StoredSubscription = {
    endpoint: string
    p256dh: string
    auth: string
}

type PushSubscription = {
    endpoint: string
    keys: {
        p256dh: string
        auth: string
    }
}

export class PushService {
    constructor(
        private readonly vapidKeys: VapidKeys,
        private readonly subject: string,
        private readonly store: Store
    ) {
        webPush.setVapidDetails(this.subject, this.vapidKeys.publicKey, this.vapidKeys.privateKey)
    }

    async sendToNamespace(namespace: string, payload: PushPayload): Promise<PushDeliveryReport> {
        const subscriptions = this.store.push.getPushSubscriptionsByNamespace(namespace)
        if (subscriptions.length === 0) {
            return { total: 0, sent: 0, removed: 0, failed: 0 }
        }

        const body = JSON.stringify(payload)
        const results = await Promise.all(subscriptions.map((subscription) => {
            return this.sendToSubscription(namespace, subscription, body)
        }))
        return {
            total: subscriptions.length,
            sent: results.filter((result) => result === 'sent').length,
            removed: results.filter((result) => result === 'removed').length,
            failed: results.filter((result) => result === 'failed').length
        }
    }

    private async sendToSubscription(
        namespace: string,
        subscription: StoredSubscription,
        body: string
    ): Promise<'sent' | 'removed' | 'failed'> {
        const pushSubscription: PushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
            }
        }

        try {
            await webPush.sendNotification(pushSubscription, body)
            return 'sent'
        } catch (error) {
            const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
                ? (error as { statusCode: number }).statusCode
                : null

            if (statusCode === 404 || statusCode === 410) {
                this.store.push.removePushSubscription(namespace, subscription.endpoint)
                return 'removed'
            }

            console.error('[PushService] Failed to send notification:', error)
            return 'failed'
        }
    }
}

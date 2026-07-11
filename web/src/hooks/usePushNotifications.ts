import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'

export type PushAvailability = 'available' | 'insecure-context' | 'unsupported'

export function getPushAvailability(): PushAvailability {
    if (typeof window === 'undefined') return 'unsupported'
    if (!window.isSecureContext) return 'insecure-context'
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'unsupported'
    }
    return 'available'
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
    const base64 = (base64Url + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/')
    const raw = atob(base64)
    const output = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) {
        output[i] = raw.charCodeAt(i)
    }
    return output
}

export function usePushNotifications(api: ApiClient | null) {
    const [availability, setAvailability] = useState<PushAvailability>(() => getPushAvailability())
    const [permission, setPermission] = useState<NotificationPermission>('default')
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refreshSubscription = useCallback(async () => {
        const nextAvailability = getPushAvailability()
        setAvailability(nextAvailability)
        if (nextAvailability !== 'available') {
            setIsSubscribed(false)
            return
        }

        setPermission(Notification.permission)

        if (Notification.permission !== 'granted') {
            setIsSubscribed(false)
            return
        }

        try {
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()
            setIsSubscribed(Boolean(subscription))
            setError(null)
        } catch (cause) {
            console.error('[PushNotifications] Failed to inspect subscription:', cause)
            setIsSubscribed(false)
            setError('subscription-check-failed')
        }
    }, [])

    useEffect(() => {
        void refreshSubscription()
    }, [refreshSubscription])

    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (getPushAvailability() !== 'available') {
            return false
        }

        try {
            const result = await Notification.requestPermission()
            setPermission(result)
            setError(null)
            if (result !== 'granted') {
                setIsSubscribed(false)
            }
            return result === 'granted'
        } catch (cause) {
            console.error('[PushNotifications] Permission request failed:', cause)
            setIsSubscribed(false)
            setError('permission-request-failed')
            return false
        }
    }, [])

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!api || getPushAvailability() !== 'available') {
            return false
        }

        if (Notification.permission !== 'granted') {
            setPermission(Notification.permission)
            return false
        }

        try {
            const registration = await navigator.serviceWorker.ready
            const existing = await registration.pushManager.getSubscription()
            const { publicKey } = await api.getPushVapidPublicKey()
            const applicationServerKey = base64UrlToUint8Array(publicKey).buffer as ArrayBuffer
            const subscription = existing ?? await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            })

            const json = subscription.toJSON()
            const keys = json.keys
            if (!json.endpoint || !keys?.p256dh || !keys.auth) {
                return false
            }

            await api.subscribePushNotifications({
                endpoint: json.endpoint,
                keys: {
                    p256dh: keys.p256dh,
                    auth: keys.auth
                }
            })
            setIsSubscribed(true)
            setError(null)
            return true
        } catch (error) {
            console.error('[PushNotifications] Failed to subscribe:', error)
            setError('subscribe-failed')
            return false
        }
    }, [api])

    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!api || getPushAvailability() !== 'available') {
            return false
        }

        try {
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
                setIsSubscribed(false)
                return true
            }

            const endpoint = subscription.endpoint
            const success = await subscription.unsubscribe()
            await api.unsubscribePushNotifications({ endpoint })
            setIsSubscribed(false)
            setError(null)
            return success
        } catch (error) {
            console.error('[PushNotifications] Failed to unsubscribe:', error)
            setError('unsubscribe-failed')
            return false
        }
    }, [api])

    return {
        availability,
        isSupported: availability === 'available',
        permission,
        isSubscribed,
        error,
        requestPermission,
        subscribe,
        unsubscribe,
        refreshSubscription
    }
}

import { afterEach, describe, expect, it } from 'vitest'
import { getPushAvailability } from './usePushNotifications'

const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalPushManager = Object.getOwnPropertyDescriptor(window, 'PushManager')
const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')

function define(target: object, property: string, value: unknown) {
    Object.defineProperty(target, property, { configurable: true, value })
}

function restore(target: object, property: string, descriptor: PropertyDescriptor | undefined) {
    if (descriptor) Object.defineProperty(target, property, descriptor)
    else Reflect.deleteProperty(target, property)
}

afterEach(() => {
    restore(window, 'isSecureContext', originalSecureContext)
    restore(navigator, 'serviceWorker', originalServiceWorker)
    restore(window, 'PushManager', originalPushManager)
    restore(window, 'Notification', originalNotification)
})

describe('getPushAvailability', () => {
    it('explains that an insecure origin cannot use push', () => {
        define(window, 'isSecureContext', false)
        expect(getPushAvailability()).toBe('insecure-context')
    })

    it('reports unsupported when a secure browser lacks push APIs', () => {
        define(window, 'isSecureContext', true)
        restore(navigator, 'serviceWorker', undefined)
        restore(window, 'PushManager', undefined)
        restore(window, 'Notification', undefined)
        expect(getPushAvailability()).toBe('unsupported')
    })

    it('reports available only when all required secure-context APIs exist', () => {
        define(window, 'isSecureContext', true)
        define(navigator, 'serviceWorker', {})
        define(window, 'PushManager', class PushManager {})
        define(window, 'Notification', class Notification {})
        expect(getPushAvailability()).toBe('available')
    })
})

import type { Session } from '../sync/syncEngine'
import type { SessionEndReason } from '@orbix/protocol'

export type TaskNotification = {
    summary: string
    status?: string
}

export type NotificationChannel = {
    sendSessionStarted?: (session: Session) => Promise<void>
    sendReady: (session: Session) => Promise<void>
    sendPermissionRequest: (session: Session) => Promise<void>
    sendTaskNotification: (session: Session, notification: TaskNotification) => Promise<void>
    sendSessionCompletion?: (session: Session, reason: SessionEndReason) => Promise<void>
}

export type NotificationHubOptions = {
    readyCooldownMs?: number
    permissionDebounceMs?: number
}

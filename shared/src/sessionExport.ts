import { z } from 'zod'
import { DecryptedMessageSchema, SessionSchema } from './schemas'

export const ORBIX_SESSION_EXPORT_SCHEMA_VERSION = 1
export const SESSION_EXPORT_MESSAGE_LIMIT = 20_000

export const OrbixSessionExportSchema = z.object({
    schemaVersion: z.literal(ORBIX_SESSION_EXPORT_SCHEMA_VERSION),
    exportedAt: z.number().int().nonnegative(),
    session: SessionSchema,
    messages: z.array(DecryptedMessageSchema)
})

export type OrbixSessionExport = z.infer<typeof OrbixSessionExportSchema>

export type OrbixSessionExportResult =
    | { type: 'success'; payload: OrbixSessionExport }
    | { type: 'too-large'; count: number; limit: number }

import type { KimiPermissionMode } from '@orbix/protocol/types';

export type PermissionMode = KimiPermissionMode;

export interface KimiMode {
    permissionMode: PermissionMode;
    model?: string;
}

import type { ComponentType, SVGProps } from 'react'
import ClaudeCode from '@lobehub/icons/es/ClaudeCode/components/Mono'
import Codex from '@lobehub/icons/es/Codex/components/Mono'
import Cursor from '@lobehub/icons/es/Cursor/components/Mono'
import Gemini from '@lobehub/icons/es/Gemini/components/Mono'
import Kimi from '@lobehub/icons/es/Kimi/components/Mono'
import OpenCode from '@lobehub/icons/es/OpenCode/components/Mono'

type ProviderIcon = ComponentType<SVGProps<SVGSVGElement>>

const PROVIDER_ICONS: Record<string, ProviderIcon> = {
    claude: ClaudeCode,
    codex: Codex,
    cursor: Cursor,
    gemini: Gemini,
    kimi: Kimi,
    opencode: OpenCode,
}

export function AgentFlavorIcon({ flavor, className }: { flavor?: string | null; className?: string }) {
    const normalized = (flavor ?? '').trim().toLowerCase()
    const Icon = PROVIDER_ICONS[normalized]

    return (
        <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center rounded-md bg-[var(--app-subtle-bg)] p-[2px] text-[var(--app-fg)] ${className ?? 'h-4 w-4'}`}
        >
            {Icon ? (
                <Icon className="h-full w-full" />
            ) : (
                <span className="text-[9px] font-semibold leading-none">{normalized === 'pi' ? 'π' : '?'}</span>
            )}
        </span>
    )
}

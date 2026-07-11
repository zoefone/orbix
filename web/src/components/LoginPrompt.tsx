import { useCallback, useEffect, useState } from 'react'
import { ApiClient } from '@/api/client'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'
import type { ServerUrlResult } from '@/hooks/useServerUrl'

type LoginPromptProps = {
    mode?: 'login' | 'bind'
    onLogin?: (token: string) => void
    onBind?: (token: string) => Promise<void>
    baseUrl: string
    serverUrl: string | null
    setServerUrl: (input: string) => ServerUrlResult
    clearServerUrl: () => void
    requireServerUrl?: boolean
    error?: string | null
}

export function LoginPrompt(props: LoginPromptProps) {
    const { t } = useTranslation()
    const isBindMode = props.mode === 'bind'
    const [accessToken, setAccessToken] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(props.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()

        const trimmedToken = accessToken.trim()
        if (!trimmedToken) {
            setError(t('login.error.enterToken'))
            return
        }

        if (!isBindMode && props.requireServerUrl && !props.serverUrl) {
            setServerError(t('login.server.required'))
            setIsServerDialogOpen(true)
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            if (isBindMode) {
                if (!props.onBind) {
                    setError(t('login.error.bindingUnavailable'))
                    return
                }
                await props.onBind(trimmedToken)
            } else {
                // Validate token by attempting to authenticate
                const client = new ApiClient('', { baseUrl: props.baseUrl })
                await client.authenticate({ accessToken: trimmedToken })
                // If successful, pass token to parent
                if (!props.onLogin) {
                    setError(t('login.error.loginUnavailable'))
                    return
                }
                props.onLogin(trimmedToken)
            }
        } catch (e) {
            const fallbackMessage = isBindMode ? t('login.error.bindFailed') : t('login.error.authFailed')
            setError(e instanceof Error ? e.message : fallbackMessage)
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, props, t, isBindMode])

    useEffect(() => {
        if (!isServerDialogOpen) {
            return
        }
        setServerInput(props.serverUrl ?? '')
    }, [isServerDialogOpen, props.serverUrl])

    const handleSaveServer = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        const result = props.setServerUrl(serverInput)
        if (!result.ok) {
            setServerError(result.error)
            return
        }
        setServerError(null)
        setServerInput(result.value)
        setIsServerDialogOpen(false)
    }, [props, serverInput])

    const handleClearServer = useCallback(() => {
        props.clearServerUrl()
        setServerInput('')
        setServerError(null)
        setIsServerDialogOpen(false)
    }, [props])

    const handleServerDialogOpenChange = useCallback((open: boolean) => {
        setIsServerDialogOpen(open)
        if (!open) {
            setServerError(null)
        }
    }, [])

    const displayError = error || props.error
    const serverSummary = props.serverUrl ?? `${props.baseUrl} ${t('login.server.default')}`
    const title = isBindMode ? t('login.bind.title') : t('login.title')
    const subtitle = t('login.subtitle')
    const submitLabel = isBindMode ? t('login.bind.submit') : t('login.submit')

    return (
        <div className="relative h-full min-h-0 overflow-y-auto bg-[var(--app-secondary-bg)] px-4 py-8 sm:px-6">
            {/* Language switcher */}
            <div className="absolute top-4 right-4">
                <LanguageSwitcher />
            </div>

            <div className="mx-auto grid min-h-full w-full max-w-4xl place-items-center">
                <div className="grid w-full overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-bg)] shadow-[0_24px_80px_rgba(0,0,0,0.08)] md:grid-cols-[1.05fr_0.95fr]">
                    <section className="hidden min-h-[560px] flex-col justify-between border-r border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-10 md:flex">
                        <div className="flex items-center gap-3">
                            <img src="/icon.svg" alt="" className="h-12 w-12 rounded-2xl" />
                            <div>
                                <div className="text-lg font-semibold tracking-tight">Orbix</div>
                                <div className="text-xs text-[var(--app-hint)]">{t('login.hero.kicker')}</div>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <h1 className="max-w-sm text-4xl font-semibold leading-[1.08] tracking-[-0.035em]">
                                {t('login.hero.title')}
                            </h1>
                            <p className="max-w-sm text-sm leading-6 text-[var(--app-hint)]">
                                {t('login.hero.description')}
                            </p>
                            <div className="flex flex-wrap gap-2 text-xs text-[var(--app-hint)]">
                                {['Codex', 'Claude Code', 'Cursor Agent'].map((provider) => (
                                    <span key={provider} className="rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5">{provider}</span>
                                ))}
                            </div>
                        </div>
                        <div className="text-xs text-[var(--app-hint)]">{t('login.hero.trust')}</div>
                    </section>

                    <section className="flex min-h-[560px] flex-col justify-center p-6 sm:p-10">
                        <div className="mb-8 flex items-center gap-3 md:hidden">
                            <img src="/icon.svg" alt="" className="h-12 w-12 rounded-2xl" />
                            <div className="text-xl font-semibold tracking-tight">Orbix</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-2xl font-semibold tracking-tight">{title}</div>
                            <div className="text-sm leading-6 text-[var(--app-hint)]">
                                {subtitle}
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                            <label className="block space-y-2">
                                <span className="text-xs font-medium text-[var(--app-hint)]">{t('login.placeholder')}</span>
                                <input
                                    type="password"
                                    value={accessToken}
                                    onChange={(e) => setAccessToken(e.target.value)}
                                    placeholder={t('login.placeholder')}
                                    autoComplete="current-password"
                                    disabled={isLoading}
                                    className="h-12 w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] px-4 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:border-[var(--app-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link-muted)] disabled:opacity-50"
                                />
                            </label>

                            {displayError && <div className="text-sm text-red-500">{displayError}</div>}

                            <button
                                type="submit"
                                disabled={isLoading || !accessToken.trim()}
                                aria-busy={isLoading}
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--app-button)] px-4 font-medium text-[var(--app-button-text)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isLoading ? <><Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />{isBindMode ? t('login.bind.submitting') : t('login.submitting')}</> : submitLabel}
                            </button>
                        </form>

                        {!isBindMode && (
                            <div className="mt-5 flex items-center justify-between text-xs text-[var(--app-hint)]">
                                <a href="https://orbix.run/docs" target="_blank" rel="noopener noreferrer" className="rounded-lg py-2 hover:text-[var(--app-fg)]">{t('login.help')}</a>
                                <Dialog open={isServerDialogOpen} onOpenChange={handleServerDialogOpenChange}>
                                    <DialogTrigger asChild>
                                        <button type="button" className="rounded-lg py-2 hover:text-[var(--app-fg)]">Hub · {props.serverUrl ? t('login.server.custom') : t('login.server.default')}</button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-md">
                                        <DialogHeader><DialogTitle>{t('login.server.title')}</DialogTitle><DialogDescription>{t('login.server.description')}</DialogDescription></DialogHeader>
                                        <form onSubmit={handleSaveServer} className="space-y-4">
                                            <div className="text-xs text-[var(--app-hint)]">{t('login.server.current')} {serverSummary}</div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium">{t('login.server.origin')}</label>
                                                <input type="url" value={serverInput} onChange={(e) => { setServerInput(e.target.value); setServerError(null) }} placeholder={t('login.server.placeholder')} className="w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link-muted)]" />
                                                <div className="text-[11px] text-[var(--app-hint)]">{t('login.server.hint')}</div>
                                            </div>
                                            {serverError && <div className="text-sm text-red-500">{serverError}</div>}
                                            <div className="flex items-center justify-end gap-2">
                                                {props.serverUrl && <Button type="button" variant="outline" onClick={handleClearServer}>{t('login.server.useSameOrigin')}</Button>}
                                                <Button type="submit">{t('login.server.save')}</Button>
                                            </div>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}

                        <div className="mt-10 border-t border-[var(--app-border)] pt-5 text-xs leading-5 text-[var(--app-hint)]">
                            {t('login.footer')} · {t('login.footer.copyright')} {new Date().getFullYear()} Orbix
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}

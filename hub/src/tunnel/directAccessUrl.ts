export function buildDirectAccessUrl(
    frontendUrl: string | null | undefined,
    tunnelUrl: string,
    token: string
): string {
    const target = (frontendUrl?.trim() || tunnelUrl).replace(/\/$/, '')
    const params = new URLSearchParams({ hub: tunnelUrl, token })
    return `${target}/?${params.toString()}`
}

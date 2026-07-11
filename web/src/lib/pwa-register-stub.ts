type RegisterOptions = {
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
}

// Used only by the low-memory split build. The service worker is generated in
// a second step, so the application bundle must not depend on Vite's virtual
// PWA module while Rollup is producing the core assets.
export function registerSW(options: RegisterOptions = {}) {
    options.onRegistered?.(undefined)
    return async () => undefined
}

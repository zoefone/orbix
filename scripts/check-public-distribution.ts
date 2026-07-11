import { readFileSync } from 'node:fs'

const publicFiles = [
    'README.md',
    'SECURITY.md',
    '.github/ISSUE_TEMPLATE/bug-report.yml',
    'cli/package.json',
    'cli/bin/orbix.cjs',
    'docs/.vitepress/config.ts',
    'docs/guide/installation.md',
    'docs/guide/quick-start.md',
    'docs/guide/faq.md',
    'web/src/components/LoginPrompt.tsx',
    'web/src/routes/settings/index.tsx',
    'website/src/components/Layout.tsx',
    'website/src/hooks/useLatestVersion.ts',
    'website/src/pages/Home.tsx',
]

const forbidden = [
    'github.com/tiann/hapi/releases',
    'github.com/tiann/hapi/issues',
    'github.com/tiann/hapi/discussions',
    'brew install tiann/tap/orbix',
    'npx @orbix/cli',
    'npm install -g @orbix/cli',
    'https://app.orbix.run',
    'https://orbix.run/docs',
]

const failures: string[] = []
for (const file of publicFiles) {
    const contents = readFileSync(file, 'utf8')
    for (const value of forbidden) {
        if (contents.includes(value)) failures.push(`${file}: contains ${value}`)
    }
}

if (failures.length > 0) {
    console.error('Public distribution audit failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
}

console.log(`Public distribution audit passed (${publicFiles.length} files).`)

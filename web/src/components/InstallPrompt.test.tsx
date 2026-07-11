import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from './InstallPrompt'
import zhCN from '@/lib/locales/zh-CN'

const mocks = vi.hoisted(() => ({
    dismissInstall: vi.fn(),
    promptInstall: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: () => ({
        canInstall: false,
        canInstallIOS: true,
        promptInstall: mocks.promptInstall,
        dismissInstall: mocks.dismissInstall,
        isStandalone: false,
    }),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTelegram: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
    }),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: keyof typeof zhCN) => zhCN[key] ?? key,
    }),
}))

describe('InstallPrompt', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows a fully localized iOS installation guide', () => {
        render(<InstallPrompt />)
        fireEvent.click(screen.getByRole('button', { name: '安装' }))

        expect(screen.getByText('点击 Safari 工具栏中的“分享”按钮。')).toBeInTheDocument()
        expect(screen.getByText('向下滚动并选择“添加到主屏幕”。')).toBeInTheDocument()
        expect(screen.getByText('点击右上角的“添加”。')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '关闭安装指南' })).toBeInTheDocument()
    })
})

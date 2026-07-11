import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentFlavorIcon } from './AgentFlavorIcon'

describe('AgentFlavorIcon', () => {
    it.each(['codex', 'claude', 'cursor'])('uses a vector provider icon for %s', (flavor) => {
        const { container } = render(<AgentFlavorIcon flavor={flavor} />)
        expect(container.querySelector('svg')).not.toBeNull()
    })

    it('keeps a monochrome fallback for unknown providers', () => {
        const { getByText } = render(<AgentFlavorIcon flavor="unknown" />)
        expect(getByText('?')).toBeInTheDocument()
    })
})

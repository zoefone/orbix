import { describe, expect, it } from 'vitest'
import { isZombieProcStat } from './process'

describe('isZombieProcStat', () => {
  it('recognizes zombies even when the command name contains spaces', () => {
    expect(isZombieProcStat('26109 (npm exec typesc) Z 1 2 3')).toBe(true)
  })

  it('keeps running and sleeping processes alive', () => {
    expect(isZombieProcStat('10 (node) R 1 2 3')).toBe(false)
    expect(isZombieProcStat('11 (cursor worker) S 1 2 3')).toBe(false)
  })

  it('fails closed for malformed proc data', () => {
    expect(isZombieProcStat('not-a-proc-stat')).toBe(false)
  })
})

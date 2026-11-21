import { describe, expect, it } from 'vitest'
import { firstRunSteps, showFirstRun } from './firstRun'

describe('first-run card', () => {
  it('a brand-new user has three things to do', () => {
    const steps = firstRunSteps({ friends: 0, gangs: 0 }, false)
    expect(steps?.map((s) => s.done)).toEqual([false, false, false])
    expect(showFirstRun(steps, false)).toBe(true)
  })

  it('ticks off what is done and disappears when all are done', () => {
    expect(firstRunSteps({ friends: 3, gangs: 0 }, true)?.map((s) => s.done)).toEqual([true, true, false])
    expect(showFirstRun(firstRunSteps({ friends: 3, gangs: 1 }, true), false)).toBe(false)
  })

  it('stays hidden once the user hides it, and waits for the profile', () => {
    expect(showFirstRun(firstRunSteps({ friends: 0, gangs: 0 }, false), true)).toBe(false)
    expect(showFirstRun(firstRunSteps(null, false), false)).toBe(false)
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchStalls } from '../../server/stallWatchdog'

describe('server stall watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays quiet while the ticks come on time', () => {
    const report = vi.fn()
    const timer = watchStalls(report)
    vi.advanceTimersByTime(1000)
    clearInterval(timer)
    expect(report).not.toHaveBeenCalled()
  })

  it('reports the lag when a tick comes more than 250 ms late', () => {
    const report = vi.fn()
    const timer = watchStalls(report)
    vi.advanceTimersByTime(300)
    vi.setSystemTime(Date.now() + 400)
    vi.advanceTimersByTime(100)
    clearInterval(timer)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(400)
  })

  it('does not report a lag of 250 ms or less', () => {
    const report = vi.fn()
    const timer = watchStalls(report)
    vi.setSystemTime(Date.now() + 250)
    vi.advanceTimersByTime(100)
    clearInterval(timer)
    expect(report).not.toHaveBeenCalled()
  })

  it('does not keep the process alive', () => {
    const timer = watchStalls(() => {})
    clearInterval(timer)
    expect(timer.hasRef()).toBe(false)
  })
})

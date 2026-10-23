import { describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('axios', () => ({ default: { create: () => ({ get, post }) } }))

import {
  createServer, fetchAnalytics, fetchServers, pinServer, unpinServer,
} from '../api/mockApi.js'

describe('mockApi', () => {
  it('fetchServers GETs /api/servers', async () => {
    get.mockResolvedValueOnce({ data: [{ id: 'srv-1' }] })
    await expect(fetchServers()).resolves.toEqual([{ id: 'srv-1' }])
    expect(get).toHaveBeenCalledWith('/api/servers')
  })

  it('pinServer / unpinServer POST the right path', async () => {
    post.mockResolvedValueOnce({ data: { id: 's', is_pinned: true } })
    await expect(pinServer('s')).resolves.toEqual({ id: 's', is_pinned: true })
    expect(post).toHaveBeenCalledWith('/api/servers/s/pin')

    post.mockResolvedValueOnce({ data: { id: 's', is_pinned: false } })
    await expect(unpinServer('s')).resolves.toEqual({ id: 's', is_pinned: false })
    expect(post).toHaveBeenCalledWith('/api/servers/s/unpin')
  })

  it('createServer POSTs the payload to /api/servers', async () => {
    const payload = { id: 'x', name: 'N' }
    post.mockResolvedValueOnce({ data: payload })
    await expect(createServer(payload)).resolves.toEqual(payload)
    expect(post).toHaveBeenCalledWith('/api/servers', payload, expect.anything())
  })

  it('fetchAnalytics GETs /api/analytics', async () => {
    get.mockResolvedValueOnce({ data: { total_red_errors_last_24h: 2 } })
    await expect(fetchAnalytics()).resolves.toMatchObject({ total_red_errors_last_24h: 2 })
  })
})

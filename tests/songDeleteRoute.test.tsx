import { beforeEach, expect, test, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ calls: [] as string[], failBucket: '', deleteError: false, isOwner: true }))
vi.mock('next/server', () => ({ NextResponse: class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) { return new NextResponse(JSON.stringify(body), init) }
} }))
vi.mock('@/libs/getOwnerIds', () => ({ isOwnerId: () => fixture.isOwner }))
vi.mock('@/libs/errorText', () => ({ errorText: (error: { message: string }) => error.message }))
vi.mock('@/app/api/backup/requireUser', () => ({ requireUser: async () => ({ userId: 'admin' }) }))
vi.mock('@/libs/supabaseAdmin', () => ({ supabaseAdmin: {
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { song_path: 'audio.mp3', image_path: 'cover.png' }, error: null }) }) }),
    delete: () => ({ eq: async () => { fixture.calls.push('delete row'); return { error: fixture.deleteError ? { message: 'database error' } : null } } }),
  }),
  storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => {
    fixture.calls.push(`${bucket}:${paths[0]}`)
    return { error: fixture.failBucket === bucket ? { message: 'storage error' } : null }
  } }) },
} }))

import { DELETE } from '@/app/api/songs/[id]/delete/route'

beforeEach(() => { fixture.calls.length = 0; fixture.failBucket = ''; fixture.deleteError = false; fixture.isOwner = true })
const callDelete = () => DELETE(new Request('http://localhost/api/songs/17/delete'), { params: Promise.resolve({ id: '17' }) })

test('deletes audio and cover from storage before removing the song record', async () => {
  const response = await callDelete()
  expect(response.status).toBe(200)
  expect(fixture.calls).toEqual(['songs:audio.mp3', 'images:cover.png', 'delete row'])
})

test('storage failure leaves the record available for retry', async () => {
  fixture.failBucket = 'images'
  const response = await callDelete()
  expect(response.status).toBe(502)
  expect(fixture.calls).toEqual(['songs:audio.mp3', 'images:cover.png'])
  expect((await response.json()).error).toContain('Retry')
})

test('reports when files are removed but the database deletion fails', async () => {
  fixture.deleteError = true
  const response = await callDelete()
  expect(response.status).toBe(400)
  expect((await response.json()).error).toContain('Files were removed')
})

test('a non-owner cannot delete files or the song', async () => {
  fixture.isOwner = false
  expect((await callDelete()).status).toBe(403)
  expect(fixture.calls).toEqual([])
})

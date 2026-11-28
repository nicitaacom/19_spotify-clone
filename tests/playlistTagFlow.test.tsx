import React, { useEffect, useRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const fixture = vi.hoisted(() => ({ uploads: [] as FormData[], queries: [] as string[], replace: false, localized: false }))
vi.mock('next/navigation', () => ({ usePathname: () => '/playlists/test', useRouter: () => ({ refresh() {}, replace() {} }) }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: 'test-user' }, subscription: null }) }))
vi.mock('@/hooks/useVerifyHuman', () => ({ useVerifyHuman: () => ({ isVerified: true, resetTurnstileFn() {}, shouldRenderChallenge: false }) }))
vi.mock('@/libs/fetchBilingualSongTags', () => ({ fetchBilingualSongTags: async (tags: string[]) => tags }))
vi.mock('@/libs/droppedFileKind', async importOriginal => ({ ...(await importOriginal<typeof import('@/libs/droppedFileKind')>()), coverTypeToStamp: () => null }))
vi.mock('music-metadata', () => ({ parseBlob: async () => ({ common: {} }) }))
vi.mock('@/libs/supabaseClient', () => ({ default: { from(table: string) {
  fixture.queries.push(table)
  const rows = table === '19_playlists' ? [{ id: 'p1', slug: 'test', title: 'Test', updated_at: '', visibility: 'private' }]
    : table === '19_playlist_songs' ? Array.from({ length: 11 }, (_, i) => ({ song_id: i + 1, created_at: `2026-01-${String(20-i).padStart(2, '0')}` }))
    : Array.from({ length: 11 }, (_, i) => {
      let tags: string[]
      if (fixture.localized) {
        if (i < 3) tags = ['focus', 'концентрация', 'work']
        else if (i === 3) tags = ['focus', 'концентрация']
        else tags = []
      } else if (i < 8) tags = ['new' + i]
      else {
        const uploadThreshold = fixture.replace ? 2 : 1
        const firstTag = fixture.uploads.length >= uploadThreshold ? 'rare' : 'older'
        tags = [firstTag, 'common']
      }
      return { id: i + 1, tags }
    })
  const builder = { select: () => builder, eq: () => builder, order: () => builder, range: () => Promise.resolve({ data: rows, error: null }), in: () => Promise.resolve({ data: rows, error: null }), then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows, error: null }).then(resolve) }
  return builder
} } }))
vi.mock('@/components/Modal', () => ({ default: function TestModal({ isOpen, onChange, onExitComplete, children, title, titleAside }: { isOpen: boolean; onChange: (open: boolean) => void; onExitComplete?: () => void; children: React.ReactNode; title: string; titleAside?: React.ReactNode }) {
  const exitRef = useRef(onExitComplete)
  exitRef.current = onExitComplete
  useEffect(() => { if (!isOpen) exitRef.current?.() }, [isOpen])
  return isOpen ? <div role="dialog" aria-label={title}>{titleAside}{children}<button onClick={() => onChange(false)}>Close</button></div> : null
} }))

import AddASongModal from '@/components/AddASongModal'
import useUploadModal from '@/hooks/useUploadModal'

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

test('playlist autofill skips Russian translations and fills no more than two English tags', async () => {
  fixture.localized = true
  fixture.uploads.length = 0
  useUploadModal.setState({ isOpen: true })
  render(<AddASongModal />)
  await screen.findByRole('button', { name: 'Remove tag focus' })
  expect(screen.getByRole('button', { name: 'Remove tag work' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Remove tag концентрация' })).toBeNull()
  expect(screen.getAllByRole('button', { name: /^Remove tag / })).toHaveLength(2)
  expect(within(screen.getByRole('group', { name: /Suggested tags/ })).queryByText('+ концентрация')).toBeNull()
})

const testUploadModes = test.each([false, true])
testUploadModes('removed playlist tags stay suppressed through upload (replace=%s) and reopening', async replace => {
  fixture.uploads.length = 0
  fixture.queries.length = 0
  fixture.replace = replace
  fixture.localized = false
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => {}
  Object.defineProperty(Blob.prototype, 'arrayBuffer', { configurable: true, value: async () => new ArrayBuffer(1) })
  class FakeAudio { duration = 2; onloadedmetadata: (() => void) | null = null; set src(_: string) { queueMicrotask(() => this.onloadedmetadata?.()) } }
  class FakeTransfer { files: File[] = []; items = { add: (file: File) => this.files.push(file) } }
  class FakeXHR {
    upload: Record<string, unknown> = {}; status = 0; responseText = ''; onload: (() => void) | null = null
    open() {}
    send(data: FormData) {
      fixture.uploads.push(data)
      if (replace && fixture.uploads.length === 1) { this.status = 409; this.responseText = JSON.stringify({ code: 'song_exists', song: { id: 7, title: 'Test song' } }) }
      else { this.status = 200; this.responseText = JSON.stringify({ id: 7 }) }
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('DataTransfer', FakeTransfer)
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
  useUploadModal.setState({ isOpen: true })
  const view = render(<AddASongModal />)
  const user = userEvent.setup()
  await screen.findByRole('button', { name: 'Remove tag older' })
  expect(screen.getByRole('button', { name: 'Remove tag common' })).toBeTruthy()
  expect(within(screen.getByRole('group', { name: /Suggested tags/ })).getByText('+ new0')).toBeTruthy()
  expect(fixture.queries).toContain('19_playlist_songs')
  expect(fixture.queries).toContain('19_songs')
  await user.click(screen.getByRole('button', { name: 'Remove tag older' }))
  await user.type(screen.getByLabelText('Tags (image that comes with music)'), 'rare{enter}')
  await user.click(screen.getByRole('button', { name: 'Remove tag rare' }))
  await user.type(screen.getByLabelText('Song title'), 'Test song')
  await user.type(screen.getByLabelText('Song author'), 'Artist')
  const song = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
  await user.upload(screen.getByLabelText('Select a song file'), song)
  await user.upload(screen.getByLabelText('Select an image'), new File(['image'], 'test.jpg', { type: 'image/jpeg' }))
  await waitFor(() => expect(document.querySelector('button[type=submit]')!.hasAttribute('disabled')).toBe(false))
  await user.click(document.querySelector('button[type=submit]')!)
  await waitFor(() => { if (!fixture.uploads.length) throw new Error('No upload: ' + (screen.queryByRole('alert')?.textContent ?? 'no alert')) })
  if (replace) {
    await user.click(await screen.findByRole('button', { name: 'Replace existing song' }))
    await screen.findByText('Song replaced.')
    expect(fixture.uploads[1].get('replaceSongId')).toBe('7')
  } else await screen.findByText('Song created.')
  expect(JSON.parse(String(fixture.uploads.at(-1)!.get('tags')))).not.toContain('older')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove tag common' })).toBeTruthy())
  expect(screen.queryByRole('button', { name: 'Remove tag older' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove tag rare' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Close' }))
  useUploadModal.getState().onOpen()
  await screen.findByRole('button', { name: 'Remove tag common' })
  expect(screen.queryByRole('button', { name: 'Remove tag older' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove tag rare' })).toBeNull()
  expect(within(screen.getByRole('group', { name: /Suggested tags/ })).queryByText('+ rare')).toBeNull()
  view.unmount()
  render(<AddASongModal />)
  await screen.findByRole('button', { name: 'Remove tag common' })
  expect(screen.queryByRole('button', { name: 'Remove tag rare' })).toBeNull()
})

import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Song } from '@/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }))
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/hooks/useOwnerStore', () => ({ default: () => ({ isOwner: true }) }))
vi.mock('@/actions/songPlaylists', () => ({ getSongPlaylists: async () => [{ id: 'p1', title: 'Playlist', slug: 'playlist' }] }))
vi.mock('@/libs/fetchBilingualSongTags', () => ({ fetchBilingualSongTags: async (tags: string[]) => tags }))
vi.mock('@/components/Modal', () => ({ default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? <div>{children}</div> : null }))

import EditSongModal from '@/components/EditSongModal'
import useEditSongModal from '@/hooks/useEditSongModal'
import useAddToPlaylistModal from '@/hooks/useAddToPlaylistModal'

afterEach(() => { cleanup(); useEditSongModal.getState().onClose(); useAddToPlaylistModal.getState().onClose(); vi.unstubAllGlobals() })

test('Ctrl+Enter saves the edit, including an uncommitted tag, and is disabled while another modal is open', async () => {
  const patch = vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'PATCH'
    ? new Response('{}', { status: 200 })
    : new Response(JSON.stringify({ song: { tags: ['focus'] } }), { status: 200 }))
  vi.stubGlobal('fetch', patch)
  const update = vi.fn()
  useEditSongModal.getState().onOpen({ id: '1', title: 'Song', author: 'Artist', tags: ['focus'], image_path: '' } as Song, update)
  render(<EditSongModal />)
  const user = userEvent.setup()
  await screen.findByText('Playlist')
  await user.click(screen.getByText('+ Add to playlist'))
  fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
  expect(patch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0)
  useAddToPlaylistModal.getState().onClose()
  const tagInput = screen.getByLabelText('Tags (image that comes with music)')
  await user.type(tagInput, 'work')
  fireEvent.keyDown(tagInput, { key: 'Enter', ctrlKey: true, repeat: true })
  expect(patch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0)
  fireEvent.keyDown(tagInput, { key: 'Enter', ctrlKey: true })
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  const request = patch.mock.calls.find(([, options]) => options?.method === 'PATCH')![1]!
  expect(JSON.parse(String((request.body as FormData).get('tags')))).toEqual(['focus', 'work'])
})

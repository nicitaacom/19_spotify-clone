import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlaylistDetail, Song } from '@/types'

const fixtures = vi.hoisted(() => ({ search: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: fixtures.refresh }) }))
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/searchSongsAndPlaylistsAction', () => ({ default: fixtures.search }))
vi.mock('@/hooks/useSearchModal', () => ({ default: () => ({ isOpen: true, onClose() {} }) }))
vi.mock('@/hooks/useDebounce', () => ({ default: (value: string) => value }))
vi.mock('@/hooks/useOnPlay', () => ({ default: () => () => {} }))
vi.mock('@/hooks/useOwnerStore', () => ({ default: () => ({ isOwner: true }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: 'owner' } }) }))
vi.mock('@/hooks/useIsIframeAuth', () => ({ default: () => false }))
vi.mock('@/store/modals/useAreYouSureModals', () => ({ useAreYouSureModals: () => ({ openModal: fixtures.confirm }) }))
vi.mock('@/components/Modal', () => ({ default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? <div>{children}</div> : null }))
vi.mock('@/components/MediaItem', () => ({ default: ({ data }: { data: Song }) => <span>{data.title}</span> }))
vi.mock('@/components/LikeButton', () => ({ default: () => null }))
vi.mock('@/components/AddToPlaylistButton', () => ({ default: () => null }))
vi.mock('@/components/DownloadSongButton', () => ({ default: () => null }))
vi.mock('@/components/EmbedSnippet', () => ({ default: () => null }))
vi.mock('@/components/SupportLink', () => ({ default: () => null }))
vi.mock('@/app/(site)/playlists/components/PlaylistEditor', () => ({ default: () => null }))
vi.mock('@/app/(site)/playlists/components/PlaylistPurchasePanel', () => ({ default: () => null }))

import Library from '@/components/Library'
import SearchCtrlKModal from '@/components/SearchCtrlKModal'
import DeleteSongButton from '@/components/DeleteSongButton'
import useDeletedSongs from '@/hooks/useDeletedSongs'
import usePlayer from '@/hooks/usePlayer'
import PlaylistDetailContent from '@/app/(site)/playlists/components/PlaylistDetailContent'

const song = { id: '17', title: 'Target song', author: 'Artist', user_id: 'owner', song_path: '', image_path: '', tags: [] } as Song
const other = { id: '18', title: 'Other song', author: 'Artist', user_id: 'owner', song_path: '', image_path: '', tags: [] } as Song

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); useDeletedSongs.setState({ ids: new Set() }); usePlayer.getState().reset() })

test('playlist trash permanently deletes the song and updates playlist, search, sidebar, and player', async () => {
  fixtures.confirm.mockResolvedValue(true)
  fixtures.search.mockResolvedValue({ songs: [song, other], playlists: [], songPlaylists: {} })
  const request = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', request)
  const playlist = { id: 'p1', title: 'Playlist', slug: 'playlist', songs: [
    { song_id: song.id, song, position: 0 }, { song_id: other.id, song: other, position: 1 },
  ] } as unknown as PlaylistDetail
  usePlayer.getState().startPlayback(song.id, [song, other], playlist.id)
  render(<><aside><Library songs={[song, other]} /></aside><main><PlaylistDetailContent canManage viewerId="owner" playlist={playlist} /></main><SearchCtrlKModal /></>)
  fireEvent.change(screen.getByPlaceholderText('Search songs, tags and playlists...'), { target: { value: 'target' } })
  await screen.findByText('Songs')
  expect(screen.getAllByText('Target song')).toHaveLength(3)
  await userEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Delete Target song' }))
  await waitFor(() => expect(screen.queryByText('Target song')).toBeNull())
  expect(request).toHaveBeenCalledWith('/api/songs/17/delete', { method: 'DELETE' })
  expect(usePlayer.getState().activeId).toBeUndefined()
  expect(usePlayer.getState().ids).toEqual(['18'])
  expect(screen.getAllByText('Other song')).toHaveLength(3)
})

test('a successful deletion removes a song from the sidebar and ignores an older in-flight search', async () => {
  fixtures.confirm.mockResolvedValue(true)
  let finishSearch!: (value: unknown) => void
  fixtures.search.mockReturnValue(new Promise(resolve => { finishSearch = resolve }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  render(<><aside><Library songs={[song, other]} /></aside><SearchCtrlKModal /><DeleteSongButton song={song} /></>)
  fireEvent.change(screen.getByPlaceholderText('Search songs, tags and playlists...'), { target: { value: 'target' } })
  await waitFor(() => expect(fixtures.search).toHaveBeenCalled())
  expect(within(screen.getByRole('complementary')).getByText('Target song')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Delete Target song' }))
  await waitFor(() => expect(within(screen.getByRole('complementary')).queryByText('Target song')).toBeNull())
  expect(within(screen.getByRole('complementary')).getByText('Other song')).toBeTruthy()
  finishSearch({ songs: [song, other], playlists: [], songPlaylists: {} })
  await screen.findByText('Songs')
  expect(screen.queryByText('Target song')).toBeNull()
  expect(screen.getAllByText('Other song')).toHaveLength(2)
})

test('a failed deletion keeps the song in the sidebar', async () => {
  fixtures.confirm.mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('failed', { status: 500 })))
  render(<><aside><Library songs={[song]} /></aside><DeleteSongButton song={song} /></>)
  await userEvent.click(screen.getByRole('button', { name: 'Delete Target song' }))
  expect(within(screen.getByRole('complementary')).getByText('Target song')).toBeTruthy()
  expect(useDeletedSongs.getState().ids.size).toBe(0)
})

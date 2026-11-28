import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Song } from '@/types'

vi.mock('use-sound', () => ({ default: () => [() => {}, { pause() {}, sound: null }] }))
vi.mock('@/hooks/usePlayOnPhone', () => ({ default: () => ({ postNowPlaying() {}, volumeForHowl: (volume: number) => volume }) }))
vi.mock('@/hooks/usePreloadNextTrack', () => ({ default: () => {} }))
vi.mock('@/components/MediaItem', () => ({ default: ({ data }: { data: Song }) => <span>{data.title}</span> }))
vi.mock('@/components/LikeButton', () => ({ default: () => null }))
vi.mock('@/components/AddToPlaylistButton', () => ({ default: () => null }))
vi.mock('@/components/Slider', () => ({ default: () => null }))

import PlayerContent from '@/components/PlayerContent'
import usePlayer from '@/hooks/usePlayer'

afterEach(() => { cleanup(); usePlayer.getState().reset() })

test('mobile repeat toggles the same player mode used by desktop playback', async () => {
  const song = { id: '1', title: 'Test song', author: 'Artist', user_id: 'owner', song_path: '', image_path: '' } as Song
  render(<PlayerContent song={song} songUrl="test.mp3" onRefreshUrl={() => {}} />)
  const button = screen.getByRole('button', { name: 'Repeat current song' })
  expect(button.getAttribute('aria-pressed')).toBe('false')
  await userEvent.click(button)
  expect(usePlayer.getState().repeatMode).toBe('one')
  expect(button.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'This song repeats' }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(button)
  expect(usePlayer.getState().repeatMode).toBe('next')
  expect(button.getAttribute('aria-pressed')).toBe('false')
})

import { create } from 'zustand'

export type Screen = 'games' | 'gameDetail' | 'roster' | 'stats' | 'settings'

interface AppState {
  screen: Screen
  selectedGameId: number | null
  selectedVideoId: number | null
  openGame: (gameId: number) => void
  backToGames: () => void
  openRoster: () => void
  openStats: () => void
  openSettings: () => void
  backToGame: () => void
  selectVideo: (videoId: number | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'games',
  selectedGameId: null,
  selectedVideoId: null,
  openGame: (gameId) => set({ screen: 'gameDetail', selectedGameId: gameId, selectedVideoId: null }),
  backToGames: () => set({ screen: 'games', selectedGameId: null, selectedVideoId: null }),
  openRoster: () => set({ screen: 'roster' }),
  openStats: () => set({ screen: 'stats' }),
  openSettings: () => set({ screen: 'settings' }),
  backToGame: () => set({ screen: 'gameDetail' }),
  selectVideo: (videoId) => set({ selectedVideoId: videoId })
}))

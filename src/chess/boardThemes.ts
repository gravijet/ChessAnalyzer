import type { BoardThemeId } from '../types'

export const BOARD_THEMES: Record<BoardThemeId, { light: string; dark: string; name: string }> = {
  green: { light: '#eeeed2', dark: '#769656', name: 'Grün' },
  brown: { light: '#f0d9b5', dark: '#b58863', name: 'Braun' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', name: 'Blau' },
  gray: { light: '#e9e9e9', dark: '#8a8a8a', name: 'Grau' },
}

export const BOARD_THEME_IDS = Object.keys(BOARD_THEMES) as BoardThemeId[]

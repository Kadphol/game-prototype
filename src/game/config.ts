import type { BuildingDefinition, BuildingKind } from './types'

export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720
export const TILE_SIZE = 48
export const WORLD_COLUMNS = 20
export const WORLD_ROWS = 12
export const WORLD_OFFSET_X = 160
export const WORLD_OFFSET_Y = 92
export const KING_SPEED = 170
export const INTERACTION_RANGE = 56
export const DAY_LENGTH_SECONDS = 42
export const MAX_DAYS = 5
export const WIN_PROSPERITY = 100
export const STARTING_MORALE = 100

export const PALETTE = {
  ink: 0x1e211d,
  deepInk: 0x111812,
  panel: 0x6f4a2b,
  panelDark: 0x3f2b1e,
  parchment: 0xf0d99b,
  parchmentDark: 0xbf8f4a,
  gold: 0xf4c44e,
  grass: 0x6fa34f,
  grassDark: 0x4b7d3e,
  grassLight: 0x8fbd65,
  forest: 0x2f6134,
  water: 0x3d86a3,
  stone: 0x9aa0a0,
  berry: 0xc9535d,
  wood: 0x8a5632,
  danger: 0x8a2f3a,
  dangerLight: 0xe4685d,
  blue: 0x5b9bd5,
  white: 0xfff3ce,
}

export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  hut: {
    kind: 'hut',
    label: 'Hut',
    hotkey: '1',
    cost: { wood: 18, stone: 4, food: 8, gold: 0 },
    prosperity: 18,
    description: '+pop, +gold each dawn',
  },
  farm: {
    kind: 'farm',
    label: 'Farm',
    hotkey: '2',
    cost: { wood: 12, stone: 2, food: 0, gold: 4 },
    prosperity: 14,
    description: 'grows food over time',
  },
  tower: {
    kind: 'tower',
    label: 'Tower',
    hotkey: '3',
    cost: { wood: 14, stone: 14, food: 0, gold: 6 },
    prosperity: 22,
    description: 'repels night hazards',
  },
}

export const BUILDING_ORDER: BuildingKind[] = ['hut', 'farm', 'tower']

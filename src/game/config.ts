import type { BuildingDefinition, BuildingKind, UpgradeDefinition, UpgradeKind } from './types'

export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720
export const TILE_SIZE = 48
export const WORLD_COLUMNS = 20
export const WORLD_ROWS = 12
export const WORLD_OFFSET_X = 160
export const WORLD_OFFSET_Y = 92
export const VILLAGER_SPEED = 92
export const DEFENDER_SPEED = 116
export const DAY_LENGTH_SECONDS = 42
export const MAX_DAYS = 5
export const WIN_PROSPERITY = 100
export const STARTING_MORALE = 100
export const MAX_VISIBLE_VILLAGERS = 7
export const TOWER_RANGE = 168
export const TOWER_DAMAGE_PER_SECOND = 26
export const RENDER_FPS = 30

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
    cost: { wood: 14, stone: 3, food: 6, gold: 0 },
    prosperity: 16,
    buildTime: 7,
    description: '+villager, +gold at dawn',
  },
  farm: {
    kind: 'farm',
    label: 'Farm',
    hotkey: '2',
    cost: { wood: 16, stone: 2, food: 0, gold: 3 },
    prosperity: 13,
    buildTime: 8,
    description: 'grows food over time',
  },
  tower: {
    kind: 'tower',
    label: 'Tower',
    hotkey: '3',
    cost: { wood: 18, stone: 16, food: 0, gold: 7 },
    prosperity: 24,
    buildTime: 10,
    description: 'fires at night hazards',
  },
}

export const BUILDING_ORDER: BuildingKind[] = ['hut', 'farm', 'tower']

export const UPGRADES: Record<UpgradeKind, UpgradeDefinition> = {
  villagerSpeed: {
    kind: 'villagerSpeed',
    label: 'Boots',
    hotkey: '4',
    baseLabel: 'Trail Boots',
    baseCost: { wood: 16, stone: 0, food: 8, gold: 5 },
    baseDescription: '+16% villager speed',
    branches: [
      {
        kind: 'trailRunners',
        label: 'Trail Runners',
        cost: { wood: 24, stone: 4, food: 10, gold: 9 },
        description: '+18% speed, shorter idle pauses',
      },
      {
        kind: 'packGuild',
        label: 'Pack Guild',
        cost: { wood: 20, stone: 4, food: 14, gold: 10 },
        description: '+1 gathered carry, +8% speed',
      },
    ],
  },
  towerDamage: {
    kind: 'towerDamage',
    label: 'Arrows',
    hotkey: '5',
    baseLabel: 'Sharp Arrows',
    baseCost: { wood: 10, stone: 12, food: 0, gold: 7 },
    baseDescription: '+32% tower damage',
    branches: [
      {
        kind: 'longbows',
        label: 'Longbows',
        cost: { wood: 14, stone: 18, food: 0, gold: 12 },
        description: '+20% damage, +25% tower range',
      },
      {
        kind: 'ballistae',
        label: 'Ballistae',
        cost: { wood: 18, stone: 24, food: 0, gold: 14 },
        description: '+55% tower damage',
      },
    ],
  },
  farmYield: {
    kind: 'farmYield',
    label: 'Seeds',
    hotkey: '6',
    baseLabel: 'Hardy Seeds',
    baseCost: { wood: 10, stone: 0, food: 12, gold: 6 },
    baseDescription: '+2 farm food yield',
    branches: [
      {
        kind: 'orchards',
        label: 'Orchards',
        cost: { wood: 16, stone: 0, food: 18, gold: 10 },
        description: '+4 farm food yield',
      },
      {
        kind: 'granaries',
        label: 'Granaries',
        cost: { wood: 20, stone: 4, food: 16, gold: 12 },
        description: '+2 food yield, +2 gold per farm tick',
      },
    ],
  },
}

export const UPGRADE_ORDER: UpgradeKind[] = ['villagerSpeed', 'towerDamage', 'farmYield']

export type GamePhase = 'start' | 'playing' | 'gameOver'

export type Terrain = 'grass' | 'water' | 'forest'

export type ResourceKind = 'wood' | 'stone' | 'food' | 'gold'

export type BuildingKind = 'hut' | 'farm' | 'tower'

export interface Vector {
  x: number
  y: number
}

export interface ResourceStock {
  wood: number
  stone: number
  food: number
  gold: number
}

export interface BuildingDefinition {
  kind: BuildingKind
  label: string
  hotkey: string
  cost: ResourceStock
  prosperity: number
  description: string
}

export interface Tile {
  column: number
  row: number
  terrain: Terrain
  buildingId?: number
}

export interface ResourceNode {
  id: number
  kind: Exclude<ResourceKind, 'gold'>
  column: number
  row: number
  amount: number
  maxAmount: number
  respawnTimer: number
}

export interface Building {
  id: number
  kind: BuildingKind
  column: number
  row: number
  age: number
  pulse: number
  productionTimer: number
}

export interface Hazard {
  id: number
  position: Vector
  speed: number
  health: number
  state: 'raiding' | 'fleeing'
  attackCooldown: number
}

export interface FloatingText {
  id: number
  text: string
  position: Vector
  color: number
  life: number
  maxLife: number
}

export interface Particle {
  id: number
  position: Vector
  velocity: Vector
  color: number
  life: number
  maxLife: number
}

export interface Player {
  position: Vector
  facing: Vector
  stepTime: number
}

export interface GameResult {
  won: boolean
  title: string
  reason: string
  score: number
}

export interface GameSnapshot {
  phase: GamePhase
  result?: GameResult
  resources: ResourceStock
  morale: number
  population: number
  prosperity: number
  day: number
  dayTimer: number
  selectedBuilding: BuildingKind
  statusMessage: string
  statusTimer: number
  player: Player
  tiles: Tile[]
  nodes: ResourceNode[]
  buildings: Building[]
  hazards: Hazard[]
  floatingTexts: FloatingText[]
  particles: Particle[]
  hoveredTile?: Tile
  canPlaceHovered: boolean
  cameraShake: number
}

export type GamePhase = 'start' | 'playing' | 'gameOver'

export type Terrain = 'grass' | 'water' | 'forest'

export type ResourceKind = 'wood' | 'stone' | 'food' | 'gold'

export type BuildingKind = 'hut' | 'farm' | 'tower'

export type TaskPriority = 'gather' | 'build' | 'defend'

export type VillagerTaskKind = 'idle' | 'gather' | 'build' | 'defend'

export type UpgradeKind = 'villagerSpeed' | 'towerDamage' | 'farmYield'

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
  buildTime: number
  description: string
}

export interface UpgradeDefinition {
  kind: UpgradeKind
  label: string
  hotkey: string
  maxLevel: number
  costs: ResourceStock[]
  description: string
}

export type UpgradeState = Record<UpgradeKind, number>

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
  complete: boolean
  buildProgress: number
  buildTime: number
  productionTimer: number
  attackCooldown: number
}

export interface Hazard {
  id: number
  position: Vector
  speed: number
  health: number
  maxHealth: number
  state: 'raiding' | 'fleeing'
  attackCooldown: number
  hitFlash: number
}

export interface VillagerTask {
  kind: VillagerTaskKind
  targetNodeId?: number
  targetBuildingId?: number
  targetHazardId?: number
  phase?: 'toTarget' | 'toCamp'
}

export interface Villager {
  id: number
  position: Vector
  target: Vector
  task: VillagerTask
  carried?: Exclude<ResourceKind, 'gold'>
  carriedAmount: number
  speed: number
  workTimer: number
  pauseTimer: number
  stepTime: number
}

export interface CommandCursor {
  column: number
  row: number
  pulse: number
}

export interface SpawnWarning {
  id: number
  position: Vector
  timer: number
  maxTimer: number
}

export interface AttackEffect {
  id: number
  from: Vector
  to: Vector
  color: number
  life: number
  maxLife: number
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
  priority: TaskPriority
  selectedBuilding: BuildingKind
  upgrades: UpgradeState
  statusMessage: string
  statusTimer: number
  king: Player
  commandCursor: CommandCursor
  tiles: Tile[]
  nodes: ResourceNode[]
  buildings: Building[]
  villagers: Villager[]
  hazards: Hazard[]
  spawnWarnings: SpawnWarning[]
  attackEffects: AttackEffect[]
  floatingTexts: FloatingText[]
  particles: Particle[]
  hoveredTile?: Tile
  canPlaceHovered: boolean
  cameraShake: number
  campHitFlash: number
}

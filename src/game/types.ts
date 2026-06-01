export type GamePhase = 'start' | 'playing' | 'gameOver'

export type Terrain = 'grass' | 'water' | 'forest'

export type ResourceKind = 'wood' | 'stone' | 'food' | 'gold'

export type BuildingKind = 'hut' | 'farm' | 'tower'

export type TaskPriority = 'gather' | 'build' | 'defend'

export type VillagerTaskKind = 'idle' | 'gather' | 'build' | 'defend'

export type UpgradeKind = 'villagerSpeed' | 'towerDamage' | 'farmYield'

export type UpgradeBranchKind = 'trailRunners' | 'packGuild' | 'longbows' | 'ballistae' | 'orchards' | 'granaries'

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
  baseLabel: string
  baseCost: ResourceStock
  baseDescription: string
  branches: UpgradeBranchDefinition[]
}

export interface UpgradeBranchDefinition {
  kind: UpgradeBranchKind
  label: string
  cost: ResourceStock
  description: string
}

export interface UpgradeTrackState {
  basePurchased: boolean
  branch?: UpgradeBranchKind
}

export type UpgradeState = Record<UpgradeKind, UpgradeTrackState>

export interface UpgradePurchase {
  kind: UpgradeKind
  branch?: UpgradeBranchKind
}

export interface JobCounts {
  idle: number
  gather: number
  build: number
  defend: number
  carrying: number
}

export interface QueuePreview {
  constructions: number
  constructionProgress: number
  hazards: number
  warnings: number
  nextResource: Exclude<ResourceKind, 'gold'>
}

export interface DebugCounts {
  villagers: number
  buildings: number
  hazards: number
  particles: number
  floatingTexts: number
  attackEffects: number
}

export interface RendererCommand {
  cursorTile?: Pick<Tile, 'column' | 'row'>
  place?: boolean
  selectedBuilding?: BuildingKind
  selectedPriority?: TaskPriority
  priorityCycle?: number
  upgradePurchase?: UpgradePurchase
  start?: boolean
  restart?: boolean
  debugToggle?: boolean
  source?: string
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
  selectedUpgrade: UpgradeKind
  upgrades: UpgradeState
  jobCounts: JobCounts
  queuePreview: QueuePreview
  debugCounts: DebugCounts
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

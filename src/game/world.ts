import {
  BUILDINGS,
  DAY_LENGTH_SECONDS,
  INTERACTION_RANGE,
  KING_SPEED,
  MAX_DAYS,
  PALETTE,
  STARTING_MORALE,
  TILE_SIZE,
  WIN_PROSPERITY,
  WORLD_COLUMNS,
  WORLD_OFFSET_X,
  WORLD_OFFSET_Y,
  WORLD_ROWS,
} from './config'
import type {
  Building,
  BuildingKind,
  FloatingText,
  GameResult,
  GameSnapshot,
  Hazard,
  Particle,
  ResourceKind,
  ResourceNode,
  ResourceStock,
  Terrain,
  Tile,
  Vector,
} from './types'

const STARTING_RESOURCES: ResourceStock = {
  wood: 28,
  stone: 14,
  food: 22,
  gold: 8,
}

interface WorldState {
  resources: ResourceStock
  morale: number
  population: number
  prosperity: number
  day: number
  dayTimer: number
  selectedBuilding: BuildingKind
  statusMessage: string
  statusTimer: number
  player: {
    position: Vector
    facing: Vector
    stepTime: number
  }
  tiles: Tile[]
  nodes: ResourceNode[]
  buildings: Building[]
  hazards: Hazard[]
  floatingTexts: FloatingText[]
  particles: Particle[]
  result?: GameResult
  nextId: number
  hazardSpawnTimer: number
  cameraShake: number
}

export interface WorldInput {
  movement: Vector
  gather: boolean
  place: boolean
  selectedBuilding?: BuildingKind
}

export class KingdomWorld {
  private state = this.createInitialState()

  snapshot(): GameSnapshot {
    const hoveredTile = this.tileAtWorld(this.state.player.position)
    return {
      phase: this.state.result ? 'gameOver' : 'playing',
      result: this.state.result,
      resources: { ...this.state.resources },
      morale: this.state.morale,
      population: this.state.population,
      prosperity: this.state.prosperity,
      day: this.state.day,
      dayTimer: this.state.dayTimer,
      selectedBuilding: this.state.selectedBuilding,
      statusMessage: this.state.statusMessage,
      statusTimer: this.state.statusTimer,
      player: {
        position: { ...this.state.player.position },
        facing: { ...this.state.player.facing },
        stepTime: this.state.player.stepTime,
      },
      tiles: this.state.tiles,
      nodes: this.state.nodes,
      buildings: this.state.buildings,
      hazards: this.state.hazards,
      floatingTexts: this.state.floatingTexts,
      particles: this.state.particles,
      hoveredTile,
      canPlaceHovered: hoveredTile ? this.canPlaceOnTile(hoveredTile, this.state.selectedBuilding) : false,
      cameraShake: this.state.cameraShake,
    }
  }

  reset(): void {
    this.state = this.createInitialState()
  }

  update(deltaSeconds: number, input: WorldInput): void {
    if (this.state.result) {
      return
    }

    // Order matters: player intent is resolved first, then passive systems advance.
    this.updateSelection(input)
    this.updatePlayer(deltaSeconds, input.movement)

    if (input.gather) {
      this.tryGather()
    }

    if (input.place) {
      this.tryPlaceBuilding()
    }

    this.updateBuildings(deltaSeconds)
    this.updateHazards(deltaSeconds)
    this.updateResourceRespawns(deltaSeconds)
    this.updateDay(deltaSeconds)
    this.updateEffects(deltaSeconds)
    this.checkEndConditions()
  }

  private createInitialState(): WorldState {
    const tiles = createTiles()
    const campColumn = Math.floor(WORLD_COLUMNS / 2)
    const campRow = Math.floor(WORLD_ROWS / 2)
    const campTile = tiles.find((tile) => tile.column === campColumn && tile.row === campRow)
    const campId = 1
    if (campTile) {
      campTile.buildingId = campId
    }

    return {
      resources: { ...STARTING_RESOURCES },
      morale: STARTING_MORALE,
      population: 3,
      prosperity: 10,
      day: 1,
      dayTimer: DAY_LENGTH_SECONDS,
      selectedBuilding: 'hut',
      statusMessage: 'Gather, build, and keep morale high.',
      statusTimer: 4,
      player: {
        position: tileCenter(campColumn + 1, campRow),
        facing: { x: 0, y: 1 },
        stepTime: 0,
      },
      tiles,
      nodes: createResourceNodes(),
      buildings: [
        {
          id: campId,
          kind: 'hut',
          column: campColumn,
          row: campRow,
          age: 0,
          pulse: 0,
          productionTimer: 0,
        },
      ],
      hazards: [],
      floatingTexts: [],
      particles: [],
      nextId: 2,
      hazardSpawnTimer: 9,
      cameraShake: 0,
    }
  }

  private updateSelection(input: WorldInput): void {
    if (!input.selectedBuilding) return

    this.state.selectedBuilding = input.selectedBuilding
    const definition = BUILDINGS[input.selectedBuilding]
    this.setStatus(`${definition.hotkey}: ${definition.label} selected - ${definition.description}`, 2.4)
  }

  private updatePlayer(deltaSeconds: number, movement: Vector): void {
    if (movement.x !== 0 || movement.y !== 0) {
      this.state.player.facing = movement
      this.state.player.stepTime += deltaSeconds * 9
    }

    const nextPosition = {
      x: this.state.player.position.x + movement.x * KING_SPEED * deltaSeconds,
      y: this.state.player.position.y + movement.y * KING_SPEED * deltaSeconds,
    }

    const clamped = clampToWorld(nextPosition)
    const nextTile = this.tileAtWorld(clamped)
    if (!nextTile || nextTile.terrain === 'water') {
      return
    }

    this.state.player.position = clamped
  }

  private tryGather(): void {
    const nearest = this.findNearestGatherableNode()
    if (!nearest) {
      this.failAtPlayer('No resource in reach')
      return
    }

    const gathered = Math.min(nearest.amount, gatherAmountFor(nearest.kind))
    nearest.amount -= gathered
    this.state.resources[nearest.kind] += gathered
    this.addFloatingText(`+${gathered} ${nearest.kind}`, tileCenter(nearest.column, nearest.row), resourceColor(nearest.kind))
    this.spawnSparkles(tileCenter(nearest.column, nearest.row), resourceColor(nearest.kind), 8)
    this.setStatus(`Gathered ${nearest.kind}.`, 1.6)

    if (nearest.amount <= 0) {
      nearest.respawnTimer = respawnTimeFor(nearest.kind)
      this.addFloatingText('depleted', tileCenter(nearest.column, nearest.row), PALETTE.parchmentDark)
    }
  }

  private tryPlaceBuilding(): void {
    const tile = this.tileAtWorld(this.state.player.position)
    const kind = this.state.selectedBuilding

    if (!tile || !this.isBuildableTile(tile)) {
      this.failAtPlayer('Cannot build here')
      return
    }

    const definition = BUILDINGS[kind]
    if (!canAfford(this.state.resources, definition.cost)) {
      this.failAtPlayer(`Need ${formatCost(definition.cost)}`)
      return
    }

    spend(this.state.resources, definition.cost)
    const building: Building = {
      id: this.state.nextId++,
      kind,
      column: tile.column,
      row: tile.row,
      age: 0,
      pulse: 1,
      productionTimer: kind === 'farm' ? 4 : 0,
    }
    tile.buildingId = building.id
    this.state.buildings.push(building)
    this.state.prosperity += definition.prosperity

    if (kind === 'hut') {
      this.state.population += 1
      this.state.morale = Math.min(100, this.state.morale + 4)
    }

    this.addFloatingText(`+${definition.prosperity} prosperity`, tileCenter(tile.column, tile.row), PALETTE.gold)
    this.spawnSparkles(tileCenter(tile.column, tile.row), PALETTE.gold, 14)
    this.setStatus(`${definition.label} raised!`, 2)
  }

  private updateBuildings(deltaSeconds: number): void {
    for (const building of this.state.buildings) {
      building.age += deltaSeconds
      building.pulse = Math.max(0, building.pulse - deltaSeconds * 2.8)

      if (building.kind === 'farm') {
        building.productionTimer -= deltaSeconds
        if (building.productionTimer <= 0) {
          building.productionTimer = 7.5
          this.state.resources.food += 3
          this.addFloatingText('+3 food', tileCenter(building.column, building.row), PALETTE.berry)
        }
      }
    }
  }

  private updateHazards(deltaSeconds: number): void {
    this.state.hazardSpawnTimer -= deltaSeconds
    const isNight = this.state.dayTimer < DAY_LENGTH_SECONDS * 0.35
    if (isNight && this.state.hazardSpawnTimer <= 0) {
      this.spawnHazard()
      this.state.hazardSpawnTimer = Math.max(4.8, 11 - this.state.day * 1.2)
    }

    const camp = tileCenter(Math.floor(WORLD_COLUMNS / 2), Math.floor(WORLD_ROWS / 2))
    const towers = this.state.buildings.filter((building) => building.kind === 'tower')

    for (const hazard of this.state.hazards) {
      hazard.attackCooldown = Math.max(0, hazard.attackCooldown - deltaSeconds)
      const repelTower = towers.find((tower) => distance(hazard.position, tileCenter(tower.column, tower.row)) < 150)

      // Towers are deliberately simple: proximity flips hazards into a fleeing state.
      if (repelTower) {
        hazard.state = 'fleeing'
        hazard.health -= deltaSeconds * 34
        this.spawnSparkles(hazard.position, PALETTE.gold, 1)
        if (hazard.health <= 0) {
          this.state.resources.gold += 2
          this.addFloatingText('+2 gold', hazard.position, PALETTE.gold)
        }
      }

      const target =
        hazard.state === 'fleeing'
          ? { x: hazard.position.x + (hazard.position.x - camp.x), y: hazard.position.y + (hazard.position.y - camp.y) }
          : camp

      const direction = normalize({ x: target.x - hazard.position.x, y: target.y - hazard.position.y })
      hazard.position.x += direction.x * hazard.speed * deltaSeconds
      hazard.position.y += direction.y * hazard.speed * deltaSeconds

      if (hazard.state === 'raiding' && distance(hazard.position, camp) < 32 && hazard.attackCooldown <= 0) {
        hazard.attackCooldown = 2.6
        this.state.morale = Math.max(0, this.state.morale - 14)
        this.state.resources.food = Math.max(0, this.state.resources.food - 4)
        this.state.cameraShake = 0.32
        this.addFloatingText('-morale', camp, PALETTE.dangerLight)
        this.spawnSparkles(camp, PALETTE.dangerLight, 10)
        this.setStatus('A night raider reached the camp!', 2.4)
      }
    }

    this.state.hazards = this.state.hazards.filter((hazard) => {
      const outside =
        hazard.position.x < WORLD_OFFSET_X - 120 ||
        hazard.position.x > WORLD_OFFSET_X + WORLD_COLUMNS * TILE_SIZE + 120 ||
        hazard.position.y < WORLD_OFFSET_Y - 120 ||
        hazard.position.y > WORLD_OFFSET_Y + WORLD_ROWS * TILE_SIZE + 120
      return hazard.health > 0 && !(hazard.state === 'fleeing' && outside)
    })
  }

  private updateResourceRespawns(deltaSeconds: number): void {
    for (const node of this.state.nodes) {
      if (node.amount > 0) continue
      node.respawnTimer -= deltaSeconds
      if (node.respawnTimer <= 0) {
        node.amount = node.maxAmount
        this.addFloatingText('regrown', tileCenter(node.column, node.row), resourceColor(node.kind))
        this.spawnSparkles(tileCenter(node.column, node.row), resourceColor(node.kind), 6)
      }
    }
  }

  private updateDay(deltaSeconds: number): void {
    this.state.dayTimer -= deltaSeconds
    if (this.state.dayTimer > 0) {
      return
    }

    if (this.state.day >= MAX_DAYS) {
      this.endGame(false, 'The final night passed before the kingdom was restored.')
      return
    }

    this.state.day += 1
    this.state.dayTimer = DAY_LENGTH_SECONDS
    const huts = this.state.buildings.filter((building) => building.kind === 'hut').length
    const dawnGold = 4 + huts * 2
    const foodCost = Math.max(1, this.state.population)
    this.state.resources.gold += dawnGold
    this.state.resources.food = Math.max(0, this.state.resources.food - foodCost)
    if (this.state.resources.food <= 0) {
      this.state.morale = Math.max(0, this.state.morale - 12)
      this.setStatus(`Day ${this.state.day}: food ran short, morale dropped.`, 2.8)
    } else {
      this.state.morale = Math.min(100, this.state.morale + 5)
      this.setStatus(`Day ${this.state.day}: dawn taxes +${dawnGold} gold.`, 2.8)
    }
  }

  private updateEffects(deltaSeconds: number): void {
    this.state.statusTimer = Math.max(0, this.state.statusTimer - deltaSeconds)
    this.state.cameraShake = Math.max(0, this.state.cameraShake - deltaSeconds)

    for (const text of this.state.floatingTexts) {
      text.position.y -= deltaSeconds * 28
      text.life -= deltaSeconds
    }
    this.state.floatingTexts = this.state.floatingTexts.filter((text) => text.life > 0)

    for (const particle of this.state.particles) {
      particle.position.x += particle.velocity.x * deltaSeconds
      particle.position.y += particle.velocity.y * deltaSeconds
      particle.life -= deltaSeconds
    }
    this.state.particles = this.state.particles.filter((particle) => particle.life > 0)
  }

  private checkEndConditions(): void {
    if (this.state.result) return

    if (this.state.prosperity >= WIN_PROSPERITY) {
      this.endGame(true, 'The camp has grown into a gentle little kingdom.')
      return
    }

    if (this.state.morale <= 0) {
      this.endGame(false, 'Morale collapsed after too many hard nights.')
    }
  }

  private endGame(won: boolean, reason: string): void {
    this.state.result = {
      won,
      title: won ? 'Kingdom Restored' : 'Kingdom Faded',
      reason,
      score: Math.max(0, Math.round(this.state.prosperity * 12 + this.state.population * 8 + this.state.morale)),
    }
  }

  private spawnHazard(): void {
    const side = Math.floor(Math.random() * 4)
    const minX = WORLD_OFFSET_X
    const maxX = WORLD_OFFSET_X + WORLD_COLUMNS * TILE_SIZE
    const minY = WORLD_OFFSET_Y
    const maxY = WORLD_OFFSET_Y + WORLD_ROWS * TILE_SIZE
    const position =
      side === 0
        ? { x: minX - 32, y: randomBetween(minY, maxY) }
        : side === 1
          ? { x: maxX + 32, y: randomBetween(minY, maxY) }
          : side === 2
            ? { x: randomBetween(minX, maxX), y: minY - 32 }
            : { x: randomBetween(minX, maxX), y: maxY + 32 }

    this.state.hazards.push({
      id: this.state.nextId++,
      position,
      speed: 62 + this.state.day * 4,
      health: 35,
      state: 'raiding',
      attackCooldown: 0,
    })
    this.setStatus('Night raider incoming. Build towers to repel it.', 2.4)
  }

  private findNearestGatherableNode(): ResourceNode | undefined {
    let nearest: ResourceNode | undefined
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const node of this.state.nodes) {
      if (node.amount <= 0) continue
      const nodeDistance = distance(this.state.player.position, tileCenter(node.column, node.row))
      if (nodeDistance < INTERACTION_RANGE && nodeDistance < nearestDistance) {
        nearest = node
        nearestDistance = nodeDistance
      }
    }

    return nearest
  }

  private canPlaceOnTile(tile: Tile, kind: BuildingKind): boolean {
    const definition = BUILDINGS[kind]
    return this.isBuildableTile(tile) && canAfford(this.state.resources, definition.cost)
  }

  private isBuildableTile(tile: Tile): boolean {
    const nearCamp = distance(tileCenter(tile.column, tile.row), tileCenter(Math.floor(WORLD_COLUMNS / 2), Math.floor(WORLD_ROWS / 2))) < 340
    const nodeOnTile = this.state.nodes.some((node) => node.column === tile.column && node.row === tile.row && node.amount > 0)

    return (
      tile.terrain === 'grass' &&
      tile.buildingId === undefined &&
      !nodeOnTile &&
      nearCamp
    )
  }

  private tileAtWorld(position: Vector): Tile | undefined {
    const column = Math.floor((position.x - WORLD_OFFSET_X) / TILE_SIZE)
    const row = Math.floor((position.y - WORLD_OFFSET_Y) / TILE_SIZE)
    return this.state.tiles.find((tile) => tile.column === column && tile.row === row)
  }

  private failAtPlayer(message: string): void {
    this.addFloatingText(message, this.state.player.position, PALETTE.dangerLight)
    this.spawnSparkles(this.state.player.position, PALETTE.dangerLight, 5)
    this.setStatus(message, 1.8)
  }

  private setStatus(message: string, timer: number): void {
    this.state.statusMessage = message
    this.state.statusTimer = timer
  }

  private addFloatingText(text: string, position: Vector, color: number): void {
    this.state.floatingTexts.push({
      id: this.state.nextId++,
      text,
      position: { ...position },
      color,
      life: 1.4,
      maxLife: 1.4,
    })
  }

  private spawnSparkles(position: Vector, color: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(18, 68)
      this.state.particles.push({
        id: this.state.nextId++,
        position: { ...position },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        color,
        life: randomBetween(0.28, 0.74),
        maxLife: 0.74,
      })
    }
  }
}

export function tileCenter(column: number, row: number): Vector {
  return {
    x: WORLD_OFFSET_X + column * TILE_SIZE + TILE_SIZE / 2,
    y: WORLD_OFFSET_Y + row * TILE_SIZE + TILE_SIZE / 2,
  }
}

export function createTiles(): Tile[] {
  const tiles: Tile[] = []
  for (let row = 0; row < WORLD_ROWS; row += 1) {
    for (let column = 0; column < WORLD_COLUMNS; column += 1) {
      let terrain: Terrain = 'grass'
      if (row === 0 || column === 0 || row === WORLD_ROWS - 1 || column === WORLD_COLUMNS - 1) {
        terrain = 'forest'
      }
      if ((column === 17 && row > 6) || (column === 18 && row > 5)) {
        terrain = 'water'
      }
      tiles.push({ column, row, terrain })
    }
  }
  return tiles
}

function createResourceNodes(): ResourceNode[] {
  const placements: Array<[ResourceNode['kind'], number, number, number]> = [
    ['wood', 2, 2, 18],
    ['wood', 4, 3, 18],
    ['wood', 3, 8, 18],
    ['wood', 14, 2, 18],
    ['wood', 16, 4, 18],
    ['stone', 6, 2, 12],
    ['stone', 13, 8, 12],
    ['stone', 5, 9, 12],
    ['food', 8, 3, 14],
    ['food', 11, 9, 14],
    ['food', 15, 7, 14],
  ]

  return placements.map(([kind, column, row, amount], index) => ({
    id: index + 100,
    kind,
    column,
    row,
    amount,
    maxAmount: amount,
    respawnTimer: 0,
  }))
}

function clampToWorld(position: Vector): Vector {
  return {
    x: Math.max(WORLD_OFFSET_X + TILE_SIZE, Math.min(WORLD_OFFSET_X + (WORLD_COLUMNS - 1) * TILE_SIZE, position.x)),
    y: Math.max(WORLD_OFFSET_Y + TILE_SIZE, Math.min(WORLD_OFFSET_Y + (WORLD_ROWS - 1) * TILE_SIZE, position.y)),
  }
}

function canAfford(resources: ResourceStock, cost: ResourceStock): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone && resources.food >= cost.food && resources.gold >= cost.gold
}

function spend(resources: ResourceStock, cost: ResourceStock): void {
  resources.wood -= cost.wood
  resources.stone -= cost.stone
  resources.food -= cost.food
  resources.gold -= cost.gold
}

function gatherAmountFor(kind: ResourceNode['kind']): number {
  if (kind === 'wood') return 6
  if (kind === 'stone') return 4
  return 5
}

function respawnTimeFor(kind: ResourceNode['kind']): number {
  if (kind === 'wood') return 16
  if (kind === 'stone') return 21
  return 12
}

function resourceColor(kind: ResourceKind): number {
  if (kind === 'wood') return PALETTE.wood
  if (kind === 'stone') return PALETTE.stone
  if (kind === 'food') return PALETTE.berry
  return PALETTE.gold
}

function formatCost(cost: ResourceStock): string {
  return (Object.entries(cost) as Array<[ResourceKind, number]>)
    .filter(([, value]) => value > 0)
    .map(([kind, value]) => `${value} ${kind}`)
    .join(', ')
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y)
  if (length === 0) return { x: 0, y: 0 }
  return { x: vector.x / length, y: vector.y / length }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

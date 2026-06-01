import {
  BUILDINGS,
  DAY_LENGTH_SECONDS,
  DEFENDER_SPEED,
  MAX_DAYS,
  MAX_VISIBLE_VILLAGERS,
  PALETTE,
  STARTING_MORALE,
  TILE_SIZE,
  TOWER_DAMAGE_PER_SECOND,
  TOWER_RANGE,
  UPGRADES,
  VILLAGER_SPEED,
  WIN_PROSPERITY,
  WORLD_COLUMNS,
  WORLD_OFFSET_X,
  WORLD_OFFSET_Y,
  WORLD_ROWS,
} from './config'
import type {
  AttackEffect,
  Building,
  BuildingKind,
  CommandCursor,
  FloatingText,
  GameResult,
  GameSnapshot,
  Hazard,
  JobCounts,
  Particle,
  QueuePreview,
  ResourceKind,
  ResourceNode,
  ResourceStock,
  SpawnWarning,
  TaskPriority,
  Terrain,
  Tile,
  UpgradeBranchKind,
  UpgradeKind,
  UpgradePurchase,
  UpgradeState,
  Vector,
  Villager,
  VillagerTask,
} from './types'

const STARTING_RESOURCES: ResourceStock = {
  wood: 36,
  stone: 20,
  food: 26,
  gold: 11,
}

const PRIORITIES: TaskPriority[] = ['gather', 'build', 'defend']
const CAMP_COLUMN = Math.floor(WORLD_COLUMNS / 2)
const CAMP_ROW = Math.floor(WORLD_ROWS / 2)

interface WorldState {
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
  statusMessage: string
  statusTimer: number
  king: {
    position: Vector
    facing: Vector
    stepTime: number
  }
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
  result?: GameResult
  nextId: number
  hazardSpawnTimer: number
  cameraShake: number
  campHitFlash: number
}

export interface WorldInput {
  cursorDelta: Vector
  cursorTile?: Pick<CommandCursor, 'column' | 'row'>
  place: boolean
  selectedBuilding?: BuildingKind
  selectedPriority?: TaskPriority
  priorityCycle: number
  upgradePurchase?: UpgradePurchase
}

export class KingdomWorld {
  private state = this.createInitialState()

  snapshot(): GameSnapshot {
    const hoveredTile = this.tileAtCursor(this.state.commandCursor)
    return {
      phase: this.state.result ? 'gameOver' : 'playing',
      result: this.state.result,
      resources: { ...this.state.resources },
      morale: this.state.morale,
      population: this.state.population,
      prosperity: this.state.prosperity,
      day: this.state.day,
      dayTimer: this.state.dayTimer,
      priority: this.state.priority,
      selectedBuilding: this.state.selectedBuilding,
      selectedUpgrade: this.state.selectedUpgrade,
      upgrades: cloneUpgrades(this.state.upgrades),
      jobCounts: this.jobCounts(),
      queuePreview: this.queuePreview(),
      debugCounts: {
        villagers: this.state.villagers.length,
        buildings: this.state.buildings.length,
        hazards: this.state.hazards.length,
        particles: this.state.particles.length,
        floatingTexts: this.state.floatingTexts.length,
        attackEffects: this.state.attackEffects.length,
      },
      statusMessage: this.state.statusMessage,
      statusTimer: this.state.statusTimer,
      king: {
        position: { ...this.state.king.position },
        facing: { ...this.state.king.facing },
        stepTime: this.state.king.stepTime,
      },
      commandCursor: { ...this.state.commandCursor },
      tiles: this.state.tiles,
      nodes: this.state.nodes,
      buildings: this.state.buildings,
      villagers: this.state.villagers,
      hazards: this.state.hazards,
      spawnWarnings: this.state.spawnWarnings,
      attackEffects: this.state.attackEffects,
      floatingTexts: this.state.floatingTexts,
      particles: this.state.particles,
      hoveredTile,
      canPlaceHovered: hoveredTile ? this.canPlaceOnTile(hoveredTile, this.state.selectedBuilding) : false,
      cameraShake: this.state.cameraShake,
      campHitFlash: this.state.campHitFlash,
    }
  }

  reset(): void {
    this.state = this.createInitialState()
  }

  update(deltaSeconds: number, input: WorldInput): void {
    if (this.state.result) return

    this.updateSelection(input)
    this.updateCommandCursor(deltaSeconds, input.cursorDelta, input.cursorTile)

    if (input.upgradePurchase) {
      this.tryPurchaseUpgrade(input.upgradePurchase)
    }

    if (input.place) {
      this.tryPlaceBuilding()
    }

    this.ensureVillagerCount()
    this.updateVillagers(deltaSeconds)
    this.updateBuildings(deltaSeconds)
    this.updateHazards(deltaSeconds)
    this.updateResourceRespawns(deltaSeconds)
    this.updateDay(deltaSeconds)
    this.updateEffects(deltaSeconds)
    this.checkEndConditions()
  }

  private createInitialState(): WorldState {
    const tiles = createTiles()
    const campTile = tiles.find((tile) => tile.column === CAMP_COLUMN && tile.row === CAMP_ROW)
    const campId = 1
    if (campTile) {
      campTile.buildingId = campId
    }

    const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)
    const villagers = Array.from({ length: 4 }, (_, index) =>
      createVillager(index + 2, {
        x: camp.x + (index - 1.5) * 13,
        y: camp.y + 42 + (index % 2) * 8,
      })
    )

    return {
      resources: { ...STARTING_RESOURCES },
      morale: STARTING_MORALE,
      population: 4,
      prosperity: 10,
      day: 1,
      dayTimer: DAY_LENGTH_SECONDS,
      priority: 'gather',
      selectedBuilding: 'hut',
      selectedUpgrade: 'villagerSpeed',
      upgrades: {
        villagerSpeed: { basePurchased: false },
        towerDamage: { basePurchased: false },
        farmYield: { basePurchased: false },
      },
      statusMessage: 'Villagers work automatically. Set priority and place buildings.',
      statusTimer: 4.5,
      king: {
        position: { x: camp.x + 6, y: camp.y + 36 },
        facing: { x: 0, y: 1 },
        stepTime: 0,
      },
      commandCursor: {
        column: CAMP_COLUMN + 1,
        row: CAMP_ROW,
        pulse: 0,
      },
      tiles,
      nodes: createResourceNodes(),
      buildings: [
        {
          id: campId,
          kind: 'hut',
          column: CAMP_COLUMN,
          row: CAMP_ROW,
          age: 0,
          pulse: 0,
          complete: true,
          buildProgress: BUILDINGS.hut.buildTime,
          buildTime: BUILDINGS.hut.buildTime,
          productionTimer: 0,
          attackCooldown: 0,
        },
      ],
      villagers,
      hazards: [],
      spawnWarnings: [],
      attackEffects: [],
      floatingTexts: [],
      particles: [],
      nextId: 20,
      hazardSpawnTimer: DAY_LENGTH_SECONDS * 0.62,
      cameraShake: 0,
      campHitFlash: 0,
    }
  }

  private updateSelection(input: WorldInput): void {
    if (input.selectedBuilding) {
      this.state.selectedBuilding = input.selectedBuilding
      const definition = BUILDINGS[input.selectedBuilding]
      this.setStatus(`${definition.hotkey}: ${definition.label} selected - ${definition.description}`, 2.4)
    }

    if (input.selectedPriority) {
      this.setPriority(input.selectedPriority)
    } else if (input.priorityCycle !== 0) {
      const current = PRIORITIES.indexOf(this.state.priority)
      const next = (current + input.priorityCycle + PRIORITIES.length) % PRIORITIES.length
      this.setPriority(PRIORITIES[next])
    }
  }

  private setPriority(priority: TaskPriority): void {
    if (priority === this.state.priority) return

    this.state.priority = priority
    for (const villager of this.state.villagers) {
      if (villager.task.kind === 'idle' || villager.pauseTimer > 0.2) {
        villager.pauseTimer = 0
        villager.task = { kind: 'idle' }
      }
    }
    this.setStatus(`Priority: ${priority.toUpperCase()}. Villagers retask as they finish jobs.`, 2.4)
  }

  private updateCommandCursor(deltaSeconds: number, cursorDelta: Vector, cursorTile?: Pick<CommandCursor, 'column' | 'row'>): void {
    this.state.commandCursor.pulse += deltaSeconds * 5

    if (cursorTile) {
      this.state.commandCursor.column = clamp(cursorTile.column, 1, WORLD_COLUMNS - 2)
      this.state.commandCursor.row = clamp(cursorTile.row, 1, WORLD_ROWS - 2)
    }

    if (cursorDelta.x === 0 && cursorDelta.y === 0) return

    const nextColumn = clamp(this.state.commandCursor.column + Math.sign(cursorDelta.x), 1, WORLD_COLUMNS - 2)
    const nextRow = clamp(this.state.commandCursor.row + Math.sign(cursorDelta.y), 1, WORLD_ROWS - 2)
    this.state.commandCursor.column = nextColumn
    this.state.commandCursor.row = nextRow
  }

  private tryPlaceBuilding(): void {
    const tile = this.tileAtCursor(this.state.commandCursor)
    const kind = this.state.selectedBuilding

    if (!tile || !this.isBuildableTile(tile)) {
      this.failAtCursor('Cannot build here')
      return
    }

    const definition = BUILDINGS[kind]
    if (!canAfford(this.state.resources, definition.cost)) {
      this.failAtCursor(`Need ${formatCost(definition.cost)}`)
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
      complete: false,
      buildProgress: 0,
      buildTime: definition.buildTime,
      productionTimer: kind === 'farm' ? 5 : 0,
      attackCooldown: 0,
    }
    tile.buildingId = building.id
    this.state.buildings.push(building)
    this.addFloatingText('planned', tileCenter(tile.column, tile.row), PALETTE.gold)
    this.spawnSparkles(tileCenter(tile.column, tile.row), PALETTE.gold, 8)
    this.setStatus(`${definition.label} planned. Builders will finish it.`, 2.2)
  }

  private tryPurchaseUpgrade(purchase: UpgradePurchase): void {
    const definition = UPGRADES[purchase.kind]
    const state = this.state.upgrades[purchase.kind]
    this.state.selectedUpgrade = purchase.kind

    if (!purchase.branch) {
      if (state.basePurchased) {
        this.setStatus(`${definition.baseLabel} learned. Pick a ${definition.label} branch.`, 2.4)
        return
      }

      if (!canAfford(this.state.resources, definition.baseCost)) {
        this.failAtCursor(`Need ${formatCost(definition.baseCost)}`)
        return
      }

      spend(this.state.resources, definition.baseCost)
      state.basePurchased = true
      const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)
      this.addFloatingText(definition.baseLabel, camp, PALETTE.gold)
      this.spawnSparkles(camp, PALETTE.gold, 14)
      this.setStatus(`${definition.baseLabel}: ${definition.baseDescription}. Branch choice unlocked.`, 2.8)
      return
    }

    const branch = definition.branches.find((candidate) => candidate.kind === purchase.branch)
    if (!branch) return

    if (!state.basePurchased) {
      this.failAtCursor(`Unlock ${definition.baseLabel} first`)
      return
    }

    if (state.branch) {
      const chosen = definition.branches.find((candidate) => candidate.kind === state.branch)
      this.setStatus(`${chosen?.label ?? definition.label} already chosen. Other branch locked.`, 2.6)
      return
    }

    if (!canAfford(this.state.resources, branch.cost)) {
      this.failAtCursor(`Need ${formatCost(branch.cost)}`)
      return
    }

    spend(this.state.resources, branch.cost)
    state.branch = branch.kind
    const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)
    this.addFloatingText(branch.label, camp, PALETTE.gold)
    this.spawnSparkles(camp, PALETTE.gold, 18)
    this.setStatus(`${branch.label}: ${branch.description}. Alternate branch locked.`, 3)
  }

  private ensureVillagerCount(): void {
    const target = Math.min(this.state.population, MAX_VISIBLE_VILLAGERS)
    const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)
    while (this.state.villagers.length < target) {
      const index = this.state.villagers.length
      const villager = createVillager(this.state.nextId++, {
        x: camp.x + (index - 2) * 13,
        y: camp.y + 48 + (index % 2) * 8,
      })
      this.state.villagers.push(villager)
      this.addFloatingText('new villager', villager.position, PALETTE.parchment)
    }
  }

  private updateVillagers(deltaSeconds: number): void {
    const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)

    for (const villager of this.state.villagers) {
      villager.stepTime += deltaSeconds * 8
      villager.pauseTimer = Math.max(0, villager.pauseTimer - deltaSeconds)
      villager.workTimer = Math.max(0, villager.workTimer - deltaSeconds)

      if (villager.task.kind === 'idle' && villager.pauseTimer <= 0) {
        villager.task = this.chooseTaskForVillager(villager)
        villager.target = this.targetForTask(villager.task, villager)
      }

      if (villager.pauseTimer > 0) continue

      this.moveVillagerToward(villager, villager.target, deltaSeconds)

      if (distance(villager.position, villager.target) < 12) {
        this.resolveVillagerArrival(villager, camp)
      }
    }
  }

  private chooseTaskForVillager(villager: Villager): VillagerTask {
    const unfinished = this.state.buildings.filter((building) => !building.complete)
    const activeHazards = this.state.hazards.filter((hazard) => hazard.state === 'raiding')

    if (this.state.priority === 'build' && unfinished.length > 0 && villager.id % 4 !== 0) {
      return { kind: 'build', targetBuildingId: nearestBuildingId(villager.position, unfinished) }
    }

    if (this.state.priority === 'defend' && (activeHazards.length > 0 || this.hasCompleteTower()) && villager.id % 4 !== 1) {
      return { kind: 'defend', targetHazardId: nearestHazardId(villager.position, activeHazards) }
    }

    if (this.state.priority === 'gather' || villager.id % 3 !== 0) {
      const node = this.pickGatherNode(villager.position)
      if (node) return { kind: 'gather', targetNodeId: node.id, phase: 'toTarget' }
    }

    if (unfinished.length > 0) {
      return { kind: 'build', targetBuildingId: nearestBuildingId(villager.position, unfinished) }
    }

    if (activeHazards.length > 0 || this.hasCompleteTower()) {
      return { kind: 'defend', targetHazardId: nearestHazardId(villager.position, activeHazards) }
    }

    return { kind: 'idle' }
  }

  private targetForTask(task: VillagerTask, villager: Villager): Vector {
    const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)

    if (task.kind === 'gather' && task.targetNodeId) {
      const node = this.state.nodes.find((candidate) => candidate.id === task.targetNodeId && candidate.amount > 0)
      if (node) return offsetTarget(tileCenter(node.column, node.row), villager.id)
    }

    if (task.kind === 'build' && task.targetBuildingId) {
      const building = this.state.buildings.find((candidate) => candidate.id === task.targetBuildingId && !candidate.complete)
      if (building) return offsetTarget(tileCenter(building.column, building.row), villager.id)
    }

    if (task.kind === 'defend') {
      const hazard = this.state.hazards.find((candidate) => candidate.id === task.targetHazardId && candidate.state === 'raiding')
      if (hazard) return { ...hazard.position }
      const tower = this.nearestCompleteTower(villager.position)
      if (tower) return offsetTarget(tileCenter(tower.column, tower.row), villager.id)
      return offsetTarget(camp, villager.id)
    }

    return offsetTarget(camp, villager.id)
  }

  private moveVillagerToward(villager: Villager, target: Vector, deltaSeconds: number): void {
    const direction = normalize({ x: target.x - villager.position.x, y: target.y - villager.position.y })
    const speedMultiplier = this.villagerSpeedMultiplier()
    const speed = (villager.task.kind === 'defend' ? DEFENDER_SPEED : villager.speed) * speedMultiplier
    villager.position.x += direction.x * speed * deltaSeconds
    villager.position.y += direction.y * speed * deltaSeconds
  }

  private resolveVillagerArrival(villager: Villager, camp: Vector): void {
    if (villager.task.kind === 'gather') {
      if (villager.task.phase === 'toCamp' && villager.carried) {
        this.state.resources[villager.carried] += villager.carriedAmount
        this.addFloatingText(`+${villager.carriedAmount} ${villager.carried}`, villager.position, resourceColor(villager.carried))
        this.spawnSparkles(villager.position, resourceColor(villager.carried), 5)
        villager.carried = undefined
        villager.carriedAmount = 0
        villager.task = { kind: 'idle' }
        villager.pauseTimer = this.villagerPause(0.45)
        return
      }

      const node = this.state.nodes.find((candidate) => candidate.id === villager.task.targetNodeId && candidate.amount > 0)
      if (!node) {
        villager.task = { kind: 'idle' }
        return
      }

      const gathered = Math.min(node.amount, gatherAmountFor(node.kind) + this.gatherCarryBonus())
      node.amount -= gathered
      villager.carried = node.kind
      villager.carriedAmount = gathered
      villager.task.phase = 'toCamp'
      villager.target = offsetTarget(camp, villager.id)
      this.addFloatingText(`+${gathered}`, tileCenter(node.column, node.row), resourceColor(node.kind))
      this.spawnSparkles(tileCenter(node.column, node.row), resourceColor(node.kind), 4)
      if (node.amount <= 0) {
        node.respawnTimer = respawnTimeFor(node.kind)
      }
      return
    }

    if (villager.task.kind === 'build') {
      const building = this.state.buildings.find((candidate) => candidate.id === villager.task.targetBuildingId && !candidate.complete)
      if (!building) {
        villager.task = { kind: 'idle' }
        return
      }

      building.buildProgress += 0.52
      building.pulse = Math.max(building.pulse, 0.35)
      villager.pauseTimer = this.villagerPause(0.28)
      this.spawnSparkles(tileCenter(building.column, building.row), PALETTE.parchment, 1)
      if (building.buildProgress >= building.buildTime) {
        this.completeBuilding(building)
        villager.task = { kind: 'idle' }
      }
      return
    }

    if (villager.task.kind === 'defend') {
      const hazard = this.state.hazards.find((candidate) => candidate.id === villager.task.targetHazardId && candidate.state === 'raiding')
      if (hazard && distance(villager.position, hazard.position) < 38 && villager.workTimer <= 0) {
        villager.workTimer = 0.55
        this.damageHazard(hazard, 9, villager.position, PALETTE.blue)
        villager.pauseTimer = this.villagerPause(0.16)
        return
      }

      villager.target = this.targetForTask(villager.task, villager)
      villager.task = this.state.priority === 'defend' ? villager.task : { kind: 'idle' }
      villager.pauseTimer = this.villagerPause(0.35)
      return
    }

    villager.target = offsetTarget(camp, villager.id)
    villager.pauseTimer = this.villagerPause(0.65)
  }

  private completeBuilding(building: Building): void {
    const definition = BUILDINGS[building.kind]
    building.complete = true
    building.buildProgress = building.buildTime
    building.pulse = 1.1
    this.state.prosperity += definition.prosperity

    if (building.kind === 'hut') {
      this.state.population += 1
      this.state.morale = Math.min(100, this.state.morale + 5)
    }

    this.addFloatingText(`+${definition.prosperity} prosperity`, tileCenter(building.column, building.row), PALETTE.gold)
    this.spawnSparkles(tileCenter(building.column, building.row), PALETTE.gold, 16)
    this.setStatus(`${definition.label} completed!`, 2.1)
  }

  private updateBuildings(deltaSeconds: number): void {
    for (const building of this.state.buildings) {
      building.age += deltaSeconds
      building.pulse = Math.max(0, building.pulse - deltaSeconds * 2.8)
      building.attackCooldown = Math.max(0, building.attackCooldown - deltaSeconds)

      if (building.complete && building.kind === 'farm') {
        building.productionTimer -= deltaSeconds
        if (building.productionTimer <= 0) {
          building.productionTimer = 6.5
          const foodYield = this.farmFoodYield()
          const goldYield = this.farmGoldYield()
          this.state.resources.food += foodYield
          if (goldYield > 0) {
            this.state.resources.gold += goldYield
          }
          this.addFloatingText(goldYield > 0 ? `+${foodYield} food +${goldYield} gold` : `+${foodYield} food`, tileCenter(building.column, building.row), PALETTE.berry)
          this.spawnSparkles(tileCenter(building.column, building.row), PALETTE.berry, 4)
        }
      }
    }
  }

  private updateHazards(deltaSeconds: number): void {
    this.state.hazardSpawnTimer -= deltaSeconds
    const isNight = this.state.dayTimer < DAY_LENGTH_SECONDS * 0.35
    if (isNight && this.state.hazardSpawnTimer <= 0) {
      this.createSpawnWarning()
      this.state.hazardSpawnTimer = Math.max(5.8, 10.5 - this.state.day * 0.9)
    }

    this.updateSpawnWarnings(deltaSeconds)
    this.updateTowerAttacks(deltaSeconds)

    const camp = tileCenter(CAMP_COLUMN, CAMP_ROW)
    for (const hazard of this.state.hazards) {
      hazard.attackCooldown = Math.max(0, hazard.attackCooldown - deltaSeconds)
      hazard.hitFlash = Math.max(0, hazard.hitFlash - deltaSeconds)

      const target = hazard.state === 'fleeing'
        ? { x: hazard.position.x + (hazard.position.x - camp.x), y: hazard.position.y + (hazard.position.y - camp.y) }
        : camp
      const direction = normalize({ x: target.x - hazard.position.x, y: target.y - hazard.position.y })
      hazard.position.x += direction.x * hazard.speed * deltaSeconds
      hazard.position.y += direction.y * hazard.speed * deltaSeconds

      if (hazard.state === 'raiding' && distance(hazard.position, camp) < 34 && hazard.attackCooldown <= 0) {
        hazard.attackCooldown = 2.8
        hazard.state = 'fleeing'
        hazard.health -= 8
        this.state.morale = Math.max(0, this.state.morale - 13)
        this.state.resources.food = Math.max(0, this.state.resources.food - 3)
        this.state.cameraShake = 0.46
        this.state.campHitFlash = 0.42
        this.addFloatingText('-13 morale', camp, PALETTE.dangerLight)
        this.spawnSparkles(camp, PALETTE.dangerLight, 18)
        this.setStatus('Raiders hit the camp. Defend priority helps towers.', 2.8)
      }
    }

    this.state.hazards = this.state.hazards.filter((hazard) => {
      const outside =
        hazard.position.x < WORLD_OFFSET_X - 140 ||
        hazard.position.x > WORLD_OFFSET_X + WORLD_COLUMNS * TILE_SIZE + 140 ||
        hazard.position.y < WORLD_OFFSET_Y - 140 ||
        hazard.position.y > WORLD_OFFSET_Y + WORLD_ROWS * TILE_SIZE + 140
      if (hazard.health <= 0) {
        this.defeatHazard(hazard)
        return false
      }
      return !(hazard.state === 'fleeing' && outside)
    })
  }

  private updateSpawnWarnings(deltaSeconds: number): void {
    for (const warning of this.state.spawnWarnings) {
      warning.timer -= deltaSeconds
      if (warning.timer <= 0) {
        this.spawnHazard(warning.position)
      }
    }
    this.state.spawnWarnings = this.state.spawnWarnings.filter((warning) => warning.timer > 0)
  }

  private updateTowerAttacks(deltaSeconds: number): void {
    const damageBoost = (this.state.priority === 'defend' ? 1.35 : 1) * this.towerDamageMultiplier()
    const towerRange = this.towerRange()
    for (const tower of this.state.buildings) {
      if (!tower.complete || tower.kind !== 'tower') continue

      const towerCenter = tileCenter(tower.column, tower.row)
      const target = nearestHazardInRange(towerCenter, this.state.hazards, towerRange)
      if (!target) continue

      target.health -= TOWER_DAMAGE_PER_SECOND * damageBoost * deltaSeconds
      target.hitFlash = 0.16
      if (tower.attackCooldown <= 0) {
        tower.attackCooldown = 0.22
        this.addAttackEffect(towerCenter, target.position, PALETTE.gold)
        this.spawnSparkles(target.position, PALETTE.gold, 3)
      }
    }
  }

  private createSpawnWarning(): void {
    const position = randomEdgePosition()
    this.state.spawnWarnings.push({
      id: this.state.nextId++,
      position,
      timer: 2.9,
      maxTimer: 2.9,
    })
    this.setStatus('Enemy warning at the border.', 1.8)
  }

  private spawnHazard(position: Vector): void {
    this.state.hazards.push({
      id: this.state.nextId++,
      position: { ...position },
      speed: 54 + this.state.day * 5,
      health: 42 + this.state.day * 7,
      maxHealth: 42 + this.state.day * 7,
      state: 'raiding',
      attackCooldown: 0,
      hitFlash: 0,
    })
    this.setStatus('Raiders are moving toward camp.', 2.2)
  }

  private damageHazard(hazard: Hazard, amount: number, from: Vector, color: number): void {
    hazard.health -= amount
    hazard.hitFlash = 0.16
    this.addAttackEffect(from, hazard.position, color)
    this.spawnSparkles(hazard.position, color, 3)
  }

  private defeatHazard(hazard: Hazard): void {
    this.state.resources.gold += 3
    this.addFloatingText('+3 gold', hazard.position, PALETTE.gold)
    this.spawnSparkles(hazard.position, PALETTE.gold, 18)
    this.state.cameraShake = Math.max(this.state.cameraShake, 0.16)
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
    if (this.state.dayTimer > 0) return

    if (this.state.day >= MAX_DAYS) {
      this.endGame(false, 'The final night passed before the kingdom was restored.')
      return
    }

    this.state.day += 1
    this.state.dayTimer = DAY_LENGTH_SECONDS
    this.state.hazardSpawnTimer = DAY_LENGTH_SECONDS * 0.58
    const huts = this.state.buildings.filter((building) => building.complete && building.kind === 'hut').length
    const dawnGold = 4 + huts * 2
    const foodCost = Math.max(1, this.state.population)
    this.state.resources.gold += dawnGold
    this.state.resources.food = Math.max(0, this.state.resources.food - foodCost)

    if (this.state.resources.food <= 0) {
      this.state.morale = Math.max(0, this.state.morale - 12)
      this.state.campHitFlash = 0.25
      this.setStatus(`Day ${this.state.day}: food ran short, morale dropped.`, 2.8)
    } else {
      this.state.morale = Math.min(100, this.state.morale + 5)
      this.setStatus(`Day ${this.state.day}: dawn taxes +${dawnGold} gold.`, 2.8)
    }
  }

  private updateEffects(deltaSeconds: number): void {
    this.state.statusTimer = Math.max(0, this.state.statusTimer - deltaSeconds)
    this.state.cameraShake = Math.max(0, this.state.cameraShake - deltaSeconds)
    this.state.campHitFlash = Math.max(0, this.state.campHitFlash - deltaSeconds)

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

    for (const effect of this.state.attackEffects) {
      effect.life -= deltaSeconds
    }
    this.state.attackEffects = this.state.attackEffects.filter((effect) => effect.life > 0)
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

  private pickGatherNode(position: Vector): ResourceNode | undefined {
    const available = this.state.nodes.filter((node) => node.amount > 0)
    if (available.length === 0) return undefined

    const preferredKind = this.lowestResourceKind()
    const preferred = available.filter((node) => node.kind === preferredKind)
    return nearestNode(position, preferred.length > 0 ? preferred : available)
  }

  private lowestResourceKind(): ResourceNode['kind'] {
    const entries: Array<[ResourceNode['kind'], number]> = [
      ['wood', this.state.resources.wood],
      ['stone', this.state.resources.stone * 1.3],
      ['food', this.state.resources.food],
    ]
    entries.sort((a, b) => a[1] - b[1])
    return entries[0][0]
  }

  private hasCompleteTower(): boolean {
    return this.state.buildings.some((building) => building.complete && building.kind === 'tower')
  }

  private nearestCompleteTower(position: Vector): Building | undefined {
    return nearestCompleteTower(position, this.state.buildings)
  }

  private canPlaceOnTile(tile: Tile, kind: BuildingKind): boolean {
    const definition = BUILDINGS[kind]
    return this.isBuildableTile(tile) && canAfford(this.state.resources, definition.cost)
  }

  private isBuildableTile(tile: Tile): boolean {
    const nearCamp = distance(tileCenter(tile.column, tile.row), tileCenter(CAMP_COLUMN, CAMP_ROW)) < 340
    const nodeOnTile = this.state.nodes.some((node) => node.column === tile.column && node.row === tile.row && node.amount > 0)

    return (
      tile.terrain === 'grass' &&
      tile.buildingId === undefined &&
      !nodeOnTile &&
      nearCamp
    )
  }

  private tileAtCursor(cursor: CommandCursor): Tile | undefined {
    return this.state.tiles[cursor.row * WORLD_COLUMNS + cursor.column]
  }

  private failAtCursor(message: string): void {
    const position = tileCenter(this.state.commandCursor.column, this.state.commandCursor.row)
    this.addFloatingText(message, position, PALETTE.dangerLight)
    this.spawnSparkles(position, PALETTE.dangerLight, 5)
    this.setStatus(message, 1.8)
  }

  private setStatus(message: string, timer: number): void {
    this.state.statusMessage = message
    this.state.statusTimer = timer
  }

  private hasUpgradeBase(kind: UpgradeKind): boolean {
    return this.state.upgrades[kind].basePurchased
  }

  private hasUpgradeBranch(branch: UpgradeBranchKind): boolean {
    return Object.values(this.state.upgrades).some((track) => track.branch === branch)
  }

  private villagerSpeedMultiplier(): number {
    let multiplier = this.hasUpgradeBase('villagerSpeed') ? 1.16 : 1
    if (this.hasUpgradeBranch('trailRunners')) multiplier += 0.18
    if (this.hasUpgradeBranch('packGuild')) multiplier += 0.08
    return multiplier
  }

  private gatherCarryBonus(): number {
    return this.hasUpgradeBranch('packGuild') ? 1 : 0
  }

  private villagerPause(base: number): number {
    return this.hasUpgradeBranch('trailRunners') ? base * 0.74 : base
  }

  private towerDamageMultiplier(): number {
    let multiplier = this.hasUpgradeBase('towerDamage') ? 1.32 : 1
    if (this.hasUpgradeBranch('longbows')) multiplier += 0.2
    if (this.hasUpgradeBranch('ballistae')) multiplier += 0.55
    return multiplier
  }

  private towerRange(): number {
    return this.hasUpgradeBranch('longbows') ? TOWER_RANGE * 1.25 : TOWER_RANGE
  }

  private farmFoodYield(): number {
    let yieldAmount = 5
    if (this.hasUpgradeBase('farmYield')) yieldAmount += 2
    if (this.hasUpgradeBranch('orchards')) yieldAmount += 4
    if (this.hasUpgradeBranch('granaries')) yieldAmount += 2
    return yieldAmount
  }

  private farmGoldYield(): number {
    return this.hasUpgradeBranch('granaries') ? 2 : 0
  }

  private jobCounts(): JobCounts {
    const counts = { idle: 0, gather: 0, build: 0, defend: 0, carrying: 0 }
    for (const villager of this.state.villagers) {
      counts[villager.task.kind] += 1
      if (villager.carried) counts.carrying += 1
    }
    return counts
  }

  private queuePreview(): QueuePreview {
    const constructionSites = this.state.buildings.filter((building) => !building.complete)
    const totalProgress = constructionSites.reduce((sum, building) => sum + Math.min(1, building.buildProgress / building.buildTime), 0)
    return {
      constructions: constructionSites.length,
      constructionProgress: constructionSites.length > 0 ? totalProgress / constructionSites.length : 1,
      hazards: this.state.hazards.filter((hazard) => hazard.state === 'raiding').length,
      warnings: this.state.spawnWarnings.length,
      nextResource: this.lowestResourceKind(),
    }
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
    capNewest(this.state.floatingTexts, 36)
  }

  private addAttackEffect(from: Vector, to: Vector, color: number): void {
    this.state.attackEffects.push({
      id: this.state.nextId++,
      from: { ...from },
      to: { ...to },
      color,
      life: 0.18,
      maxLife: 0.18,
    })
    capNewest(this.state.attackEffects, 32)
  }

  private spawnSparkles(position: Vector, color: number, count: number): void {
    const availableSlots = Math.max(0, 128 - this.state.particles.length)
    const spawnCount = Math.min(count, availableSlots)
    for (let index = 0; index < spawnCount; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(18, 76)
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

function createVillager(id: number, position: Vector): Villager {
  return {
    id,
    position: { ...position },
    target: { ...position },
    task: { kind: 'idle' },
    carriedAmount: 0,
    speed: VILLAGER_SPEED + (id % 3) * 7,
    workTimer: 0,
    pauseTimer: randomBetween(0.2, 0.9),
    stepTime: Math.random() * Math.PI * 2,
  }
}

function randomEdgePosition(): Vector {
  const side = Math.floor(Math.random() * 4)
  const minX = WORLD_OFFSET_X
  const maxX = WORLD_OFFSET_X + WORLD_COLUMNS * TILE_SIZE
  const minY = WORLD_OFFSET_Y
  const maxY = WORLD_OFFSET_Y + WORLD_ROWS * TILE_SIZE

  if (side === 0) return { x: minX - 34, y: randomBetween(minY + 24, maxY - 24) }
  if (side === 1) return { x: maxX + 34, y: randomBetween(minY + 24, maxY - 24) }
  if (side === 2) return { x: randomBetween(minX + 24, maxX - 24), y: minY - 34 }
  return { x: randomBetween(minX + 24, maxX - 24), y: maxY + 34 }
}

function canAfford(resources: ResourceStock, cost: ResourceStock): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone && resources.food >= cost.food && resources.gold >= cost.gold
}

function cloneUpgrades(upgrades: UpgradeState): UpgradeState {
  return {
    villagerSpeed: { ...upgrades.villagerSpeed },
    towerDamage: { ...upgrades.towerDamage },
    farmYield: { ...upgrades.farmYield },
  }
}

function spend(resources: ResourceStock, cost: ResourceStock): void {
  resources.wood -= cost.wood
  resources.stone -= cost.stone
  resources.food -= cost.food
  resources.gold -= cost.gold
}

function capNewest<T>(items: T[], max: number): void {
  if (items.length > max) {
    items.splice(0, items.length - max)
  }
}

function gatherAmountFor(kind: ResourceNode['kind']): number {
  if (kind === 'wood') return 5
  if (kind === 'stone') return 3
  return 4
}

function respawnTimeFor(kind: ResourceNode['kind']): number {
  if (kind === 'wood') return 15
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

function nearestNode(position: Vector, nodes: ResourceNode[]): ResourceNode | undefined {
  let nearest: ResourceNode | undefined
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const node of nodes) {
    const nodeDistance = distance(position, tileCenter(node.column, node.row))
    if (nodeDistance < nearestDistance) {
      nearest = node
      nearestDistance = nodeDistance
    }
  }
  return nearest
}

function nearestBuilding(position: Vector, buildings: Building[]): Building | undefined {
  let nearest: Building | undefined
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const building of buildings) {
    const buildingDistance = distance(position, tileCenter(building.column, building.row))
    if (buildingDistance < nearestDistance) {
      nearest = building
      nearestDistance = buildingDistance
    }
  }
  return nearest
}

function nearestBuildingId(position: Vector, buildings: Building[]): number | undefined {
  return nearestBuilding(position, buildings)?.id
}

function nearestHazard(position: Vector, hazards: Hazard[]): Hazard | undefined {
  let nearest: Hazard | undefined
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const hazard of hazards) {
    const hazardDistance = distance(position, hazard.position)
    if (hazardDistance < nearestDistance) {
      nearest = hazard
      nearestDistance = hazardDistance
    }
  }
  return nearest
}

function nearestHazardId(position: Vector, hazards: Hazard[]): number | undefined {
  return nearestHazard(position, hazards)?.id
}

function nearestHazardInRange(position: Vector, hazards: Hazard[], range: number): Hazard | undefined {
  let nearest: Hazard | undefined
  let nearestDistance = range
  for (const hazard of hazards) {
    if (hazard.state !== 'raiding') continue

    const hazardDistance = distance(position, hazard.position)
    if (hazardDistance < nearestDistance) {
      nearest = hazard
      nearestDistance = hazardDistance
    }
  }
  return nearest
}

function nearestCompleteTower(position: Vector, buildings: Building[]): Building | undefined {
  let nearest: Building | undefined
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const building of buildings) {
    if (!building.complete || building.kind !== 'tower') continue

    const buildingDistance = distance(position, tileCenter(building.column, building.row))
    if (buildingDistance < nearestDistance) {
      nearest = building
      nearestDistance = buildingDistance
    }
  }
  return nearest
}

function offsetTarget(position: Vector, seed: number): Vector {
  const angle = seed * 1.919
  return {
    x: position.x + Math.cos(angle) * 14,
    y: position.y + Math.sin(angle) * 10,
  }
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

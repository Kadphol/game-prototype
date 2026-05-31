import {
  BUILDING_ORDER,
  BUILDINGS,
  DAY_LENGTH_SECONDS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_DAYS,
  PALETTE,
  TILE_SIZE,
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
  GameResult,
  GameSnapshot,
  Hazard,
  ResourceKind,
  ResourceNode,
  ResourceStock,
  SpawnWarning,
  TaskPriority,
  Tile,
  Vector,
  Villager,
} from './types'

import {
  Container,
  FederatedPointerEvent,
  Graphics,
  Text,
  TextStyle,
  type Application,
} from 'pixi.js'

const fontFamily = '"Courier New", Courier, monospace'

const textStyles = {
  tiny: new TextStyle({ fontFamily, fontSize: 14, fill: PALETTE.white, fontWeight: '700' }),
  small: new TextStyle({ fontFamily, fontSize: 16, fill: PALETTE.white, fontWeight: '700' }),
  body: new TextStyle({ fontFamily, fontSize: 20, fill: PALETTE.white, fontWeight: '700' }),
  title: new TextStyle({ fontFamily, fontSize: 50, fill: PALETTE.gold, fontWeight: '900', dropShadow: true }),
  subtitle: new TextStyle({ fontFamily, fontSize: 22, fill: PALETTE.parchment, fontWeight: '700' }),
  dark: new TextStyle({ fontFamily, fontSize: 16, fill: PALETTE.deepInk, fontWeight: '900' }),
}

const PRIORITY_ORDER: TaskPriority[] = ['gather', 'build', 'defend']

export class KingdomRenderer {
  readonly stage = new Container()
  private readonly worldLayer = new Container()
  private readonly effectLayer = new Container()
  private readonly hudLayer = new Container()
  private readonly overlayLayer = new Container()
  private readonly background = new Graphics()
  private pointerPosition: Vector = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }

  constructor(private readonly app: Application) {
    this.stage.addChild(this.background, this.worldLayer, this.effectLayer, this.hudLayer, this.overlayLayer)
    this.stage.eventMode = 'static'
    this.stage.hitArea = app.screen
    this.stage.on('pointermove', this.handlePointerMove)
  }

  destroy(): void {
    this.stage.off('pointermove', this.handlePointerMove)
    this.stage.destroy({ children: true })
  }

  renderStart(): void {
    this.clear()
    drawBackdrop(this.background, 0)

    const centerX = GAME_WIDTH / 2
    const titlePanel = new Graphics()
      .rect(centerX - 360, 122, 720, 380)
      .fill(PALETTE.panelDark)
      .rect(centerX - 346, 136, 692, 352)
      .fill(PALETTE.panel)
      .rect(centerX - 324, 158, 648, 308)
      .fill(PALETTE.parchment)
    this.overlayLayer.addChild(titlePanel)

    const title = centeredText('Cozy Kingdom', centerX, 184, textStyles.title)
    const subtitle = centeredText('Raise a gentle realm before the fifth night.', centerX, 248, textStyles.dark)
    const controls = multilineText(
      [
        'Move cursor: WASD / Arrow Keys',
        'Villagers gather, build, and defend automatically',
        'Priority: Q/E cycle or G Gather, B Build, F Defend',
        'Build: 1 Hut, 2 Farm, 3 Watchtower',
        'Place plan: Space / Enter on an empty grass tile',
      ],
      centerX - 255,
      286,
      textStyles.dark,
      25
    )
    const start = centeredText('Press Enter to Start', centerX, 424, textStyles.subtitle)
    start.tint = PALETTE.deepInk

    this.overlayLayer.addChild(title, subtitle, ...controls, start)
    drawTinyKing(this.overlayLayer, { x: centerX, y: 548 }, 2.8, 0)
    drawTree(this.overlayLayer, centerX - 145, 570, 1.3)
    drawBerryBush(this.overlayLayer, centerX + 138, 578, 1.3)
  }

  renderGame(snapshot: GameSnapshot): void {
    this.clear()
    drawBackdrop(this.background, snapshot.dayTimer / DAY_LENGTH_SECONDS)

    // A tiny camera shake sells camp damage without complicating the simulation.
    const shake = snapshot.cameraShake > 0 ? Math.sin(performance.now() / 20) * snapshot.cameraShake * 16 : 0
    this.worldLayer.position.set(shake, -shake * 0.45)
    this.effectLayer.position.set(shake, -shake * 0.45)

    this.drawWorld(snapshot)
    this.drawEffects(snapshot)
    this.drawHud(snapshot)

    if (snapshot.phase === 'gameOver' && snapshot.result) {
      this.drawGameOver(snapshot.result)
    }
  }

  pointer(): Vector {
    return this.pointerPosition
  }

  private drawWorld(snapshot: GameSnapshot): void {
    for (const tile of snapshot.tiles) {
      drawTile(this.worldLayer, tile, snapshot.hoveredTile, snapshot.canPlaceHovered)
    }

    this.drawPlacementGhost(snapshot)

    for (const warning of snapshot.spawnWarnings) {
      drawSpawnWarning(this.worldLayer, warning)
    }

    for (const node of snapshot.nodes) {
      drawResourceNode(this.worldLayer, node)
    }

    const sortedBuildings = [...snapshot.buildings].sort((a, b) => a.row - b.row)
    for (const building of sortedBuildings) {
      drawBuilding(this.worldLayer, building)
    }

    const sortedVillagers = [...snapshot.villagers].sort((a, b) => a.position.y - b.position.y)
    for (const villager of sortedVillagers) {
      drawVillager(this.worldLayer, villager)
    }

    for (const hazard of snapshot.hazards) {
      drawHazard(this.worldLayer, hazard)
    }

    drawCampHitFlash(this.worldLayer, snapshot.campHitFlash)
    drawTinyKing(this.worldLayer, snapshot.king.position, 1.35, snapshot.king.stepTime)
  }

  private drawPlacementGhost(snapshot: GameSnapshot): void {
    if (!snapshot.hoveredTile) return

    const center = tileToScreen(snapshot.hoveredTile)
    const color = snapshot.canPlaceHovered ? PALETTE.gold : PALETTE.dangerLight
    const pulse = 0.5 + Math.sin(snapshot.commandCursor.pulse) * 0.5
    const ghost = new Graphics()
      .rect(center.x - TILE_SIZE / 2 + 4, center.y - TILE_SIZE / 2 + 4, TILE_SIZE - 8, TILE_SIZE - 8)
      .stroke({ color, alpha: 0.9, width: 3 })
      .rect(center.x - 12, center.y - 12, 24, 24)
      .fill({ color, alpha: snapshot.canPlaceHovered ? 0.18 + pulse * 0.12 : 0.18 })
      .rect(center.x - 5, center.y - 30, 10, 9)
      .fill(color)
    this.worldLayer.addChild(ghost)
  }

  private drawEffects(snapshot: GameSnapshot): void {
    for (const effect of snapshot.attackEffects) {
      drawAttackEffect(this.effectLayer, effect)
    }

    for (const particle of snapshot.particles) {
      const alpha = particle.life / particle.maxLife
      const sparkle = new Graphics()
        .rect(Math.round(particle.position.x) - 2, Math.round(particle.position.y) - 2, 4, 4)
        .fill({ color: particle.color, alpha })
      this.effectLayer.addChild(sparkle)
    }

    for (const floating of snapshot.floatingTexts) {
      const alpha = Math.max(0, floating.life / floating.maxLife)
      const text = new Text({
        text: floating.text,
        style: new TextStyle({ fontFamily, fontSize: 16, fill: floating.color, fontWeight: '900', stroke: { color: PALETTE.deepInk, width: 3 } }),
      })
      text.anchor.set(0.5)
      text.alpha = alpha
      text.position.set(floating.position.x, floating.position.y)
      this.effectLayer.addChild(text)
    }
  }

  private drawHud(snapshot: GameSnapshot): void {
    drawPanel(this.hudLayer, 22, 16, 774, 62)
    const resources = resourceLine(snapshot.resources)
    const resourceText = new Text({
      text: resources,
      style: textStyles.small,
    })
    resourceText.position.set(44, 36)
    this.hudLayer.addChild(resourceText)

    const dayProgress = 1 - snapshot.dayTimer / DAY_LENGTH_SECONDS
    drawPanel(this.hudLayer, 818, 16, 440, 62)
    const dayText = new Text({
      text: `Day ${snapshot.day}/${MAX_DAYS}  Morale ${snapshot.morale}%`,
      style: textStyles.small,
    })
    dayText.position.set(840, 30)
    const dayBar = new Graphics()
      .rect(840, 57, 170, 8)
      .fill(PALETTE.panelDark)
      .rect(840, 57, 170 * dayProgress, 8)
      .fill(snapshot.dayTimer < DAY_LENGTH_SECONDS * 0.35 ? PALETTE.dangerLight : PALETTE.gold)
      .rect(1036, 57, 170, 8)
      .fill(PALETTE.panelDark)
      .rect(1036, 57, 170 * Math.max(0, snapshot.morale / 100), 8)
      .fill(snapshot.morale > 40 ? PALETTE.grassLight : PALETTE.dangerLight)
    this.hudLayer.addChild(dayText, dayBar)

    drawPanel(this.hudLayer, 1014, 94, 244, 178)
    const objective = multilineText(
      ['Objective', `Prosperity ${snapshot.prosperity}/${WIN_PROSPERITY}`, 'before Day 5 ends.', `Villagers ${snapshot.villagers.length}/${snapshot.population}`],
      1036,
      116,
      textStyles.small,
      24
    )
    this.hudLayer.addChild(...objective)

    drawPanel(this.hudLayer, 22, 574, 332, 122)
    const priorityTitle = new Text({ text: 'Priority', style: textStyles.small })
    priorityTitle.position.set(42, 594)
    this.hudLayer.addChild(priorityTitle)
    PRIORITY_ORDER.forEach((priority, index) => {
      this.drawPriorityButton(priority, snapshot.priority === priority, 42 + index * 98, 626)
    })

    drawPanel(this.hudLayer, 374, 574, 504, 122)
    BUILDING_ORDER.forEach((kind, index) => {
      this.drawBuildButton(kind, snapshot.selectedBuilding === kind, 396 + index * 156, 612, snapshot.resources)
    })

    drawPanel(this.hudLayer, 898, 574, 360, 122)
    const selected = BUILDINGS[snapshot.selectedBuilding]
    const selectedLines = multilineText(
      [
        `${selected.label} plan`,
        `Cost ${compactCost(selected.cost)}`,
        selected.description,
        snapshot.canPlaceHovered ? 'Cursor: valid site' : 'Cursor: blocked or unaffordable',
      ],
      918,
      594,
      textStyles.small,
      22
    )
    this.hudLayer.addChild(...selectedLines)

    if (snapshot.statusTimer > 0) {
      const status = centeredText(snapshot.statusMessage, GAME_WIDTH / 2, 558, textStyles.body)
      status.tint = snapshot.statusMessage.includes('Need') || snapshot.statusMessage.includes('Cannot') ? PALETTE.dangerLight : PALETTE.white
      this.hudLayer.addChild(status)
    }
  }

  private drawBuildButton(kind: BuildingKind, selected: boolean, x: number, y: number, resources: ResourceStock): void {
    const definition = BUILDINGS[kind]
    const affordable =
      resources.wood >= definition.cost.wood &&
      resources.stone >= definition.cost.stone &&
      resources.food >= definition.cost.food &&
      resources.gold >= definition.cost.gold
    const button = new Graphics()
      .rect(x, y, 136, 62)
      .fill(selected ? PALETTE.gold : affordable ? PALETTE.parchment : 0x8c7756)
      .rect(x + 4, y + 4, 128, 54)
      .stroke({ color: selected ? PALETTE.white : PALETTE.panelDark, width: 3 })
    this.hudLayer.addChild(button)

    const label = new Text({
      text: `${definition.hotkey} ${definition.label}`,
      style: textStyles.dark,
    })
    label.position.set(x + 12, y + 8)
    const cost = new Text({
      text: compactCost(definition.cost),
      style: new TextStyle({ fontFamily, fontSize: 13, fill: PALETTE.deepInk, fontWeight: '900' }),
    })
    cost.position.set(x + 12, y + 36)
    this.hudLayer.addChild(label, cost)
  }

  private drawPriorityButton(priority: TaskPriority, selected: boolean, x: number, y: number): void {
    const button = new Graphics()
      .rect(x, y, 82, 50)
      .fill(selected ? PALETTE.gold : priorityColor(priority))
      .rect(x + 4, y + 4, 74, 42)
      .stroke({ color: selected ? PALETTE.white : PALETTE.panelDark, width: 3 })
    const label = new Text({
      text: priority.toUpperCase(),
      style: new TextStyle({ fontFamily, fontSize: 13, fill: selected ? PALETTE.deepInk : PALETTE.white, fontWeight: '900' }),
    })
    label.anchor.set(0.5)
    label.position.set(x + 41, y + 27)
    this.hudLayer.addChild(button, label)
  }

  private drawGameOver(result: GameResult): void {
    const veil = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: PALETTE.deepInk, alpha: 0.64 })
    drawPanel(this.overlayLayer, 342, 166, 596, 360)

    const title = centeredText(result.title, GAME_WIDTH / 2, 220, textStyles.title)
    title.tint = result.won ? PALETTE.gold : PALETTE.dangerLight
    const reason = centeredText(result.reason, GAME_WIDTH / 2, 292, textStyles.subtitle)
    const score = centeredText(`Score ${result.score}`, GAME_WIDTH / 2, 354, textStyles.body)
    const restart = centeredText('Press R to Restart', GAME_WIDTH / 2, 438, textStyles.body)

    this.overlayLayer.addChild(veil, title, reason, score, restart)
  }

  private clear(): void {
    this.background.clear()
    this.worldLayer.removeChildren()
    this.effectLayer.removeChildren()
    this.hudLayer.removeChildren()
    this.overlayLayer.removeChildren()
    this.worldLayer.position.set(0, 0)
    this.effectLayer.position.set(0, 0)
  }

  private readonly handlePointerMove = (event: FederatedPointerEvent): void => {
    this.pointerPosition = event.global
  }
}

function drawBackdrop(graphics: Graphics, dayProgress: number): void {
  const nightAlpha = dayProgress < 0.35 ? 0.24 : 0
  graphics.clear()
  graphics.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(PALETTE.deepInk)
  graphics.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(PALETTE.grassDark)
  for (let y = 0; y < GAME_HEIGHT; y += 24) {
    for (let x = 0; x < GAME_WIDTH; x += 24) {
      if ((x / 24 + y / 24) % 3 === 0) {
        graphics.rect(x, y, 12, 12).fill({ color: PALETTE.grass, alpha: 0.32 })
      }
    }
  }
  if (nightAlpha > 0) {
    graphics.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x162646, alpha: nightAlpha })
  }
}

function drawTile(layer: Container, tile: Tile, hoveredTile: Tile | undefined, canPlaceHovered: boolean): void {
  const center = tileToScreen(tile)
  const isHovered = hoveredTile?.column === tile.column && hoveredTile.row === tile.row
  // Chunky rectangles keep every sprite aligned to the pixel-art grid.
  const color = tile.terrain === 'water' ? PALETTE.water : tile.terrain === 'forest' ? PALETTE.forest : (tile.column + tile.row) % 2 === 0 ? PALETTE.grass : PALETTE.grassLight
  const tileGraphic = new Graphics()
    .rect(center.x - TILE_SIZE / 2, center.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE)
    .fill(color)
    .rect(center.x - TILE_SIZE / 2, center.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE)
    .stroke({ color: PALETTE.deepInk, alpha: 0.15, width: 2 })

  if (isHovered) {
    tileGraphic.rect(center.x - TILE_SIZE / 2 + 2, center.y - TILE_SIZE / 2 + 2, TILE_SIZE - 4, TILE_SIZE - 4).stroke({
      color: canPlaceHovered ? PALETTE.gold : PALETTE.dangerLight,
      alpha: 0.85,
      width: 3,
    })
  }

  layer.addChild(tileGraphic)

  if (tile.terrain === 'forest') {
    drawTree(layer, center.x, center.y + 4, 0.65)
  }

  if (tile.terrain === 'water') {
    const ripple = new Graphics()
      .rect(center.x - 14, center.y - 4, 28, 4)
      .fill({ color: PALETTE.white, alpha: 0.22 })
      .rect(center.x - 5, center.y + 8, 26, 4)
      .fill({ color: PALETTE.white, alpha: 0.16 })
    layer.addChild(ripple)
  }
}

function drawResourceNode(layer: Container, node: ResourceNode): void {
  if (node.amount <= 0) {
    return
  }

  const center = tileToScreen(node)
  if (node.kind === 'wood') {
    drawTree(layer, center.x, center.y + 8, 0.95)
  } else if (node.kind === 'stone') {
    drawRock(layer, center.x, center.y + 9)
  } else {
    drawBerryBush(layer, center.x, center.y + 8, 0.92)
  }

  const amount = new Graphics()
    .rect(center.x - 14, center.y + 18, 28, 5)
    .fill(PALETTE.panelDark)
    .rect(center.x - 14, center.y + 18, 28 * (node.amount / node.maxAmount), 5)
    .fill(resourceColor(node.kind))
  layer.addChild(amount)
}

function drawBuilding(layer: Container, building: Building): void {
  const center = tileToScreen(building)
  const scale = 1 + building.pulse * 0.18
  if (!building.complete) {
    drawConstructionSite(layer, building, center, scale)
    return
  }

  if (building.kind === 'hut') {
    const hut = new Graphics()
      .rect(center.x - 18 * scale, center.y - 4 * scale, 36 * scale, 28 * scale)
      .fill(PALETTE.panel)
      .rect(center.x - 23 * scale, center.y - 18 * scale, 46 * scale, 18 * scale)
      .fill(PALETTE.wood)
      .rect(center.x - 7 * scale, center.y + 7 * scale, 14 * scale, 17 * scale)
      .fill(PALETTE.deepInk)
      .rect(center.x - 17 * scale, center.y - 28 * scale, 34 * scale, 10 * scale)
      .fill(PALETTE.gold)
    layer.addChild(hut)
  } else if (building.kind === 'farm') {
    const farm = new Graphics()
      .rect(center.x - 20 * scale, center.y - 14 * scale, 40 * scale, 34 * scale)
      .fill(0x77512d)
    for (let index = 0; index < 4; index += 1) {
      farm.rect(center.x - 16 * scale + index * 10 * scale, center.y - 10 * scale, 4 * scale, 26 * scale).fill(PALETTE.berry)
    }
    layer.addChild(farm)
  } else {
    const tower = new Graphics()
      .rect(center.x - 13 * scale, center.y - 30 * scale, 26 * scale, 52 * scale)
      .fill(PALETTE.stone)
      .rect(center.x - 18 * scale, center.y - 38 * scale, 36 * scale, 12 * scale)
      .fill(PALETTE.panelDark)
      .rect(center.x - 9 * scale, center.y - 44 * scale, 18 * scale, 8 * scale)
      .fill(PALETTE.gold)
    layer.addChild(tower)
  }
}

function drawConstructionSite(layer: Container, building: Building, center: Vector, scale: number): void {
  const progress = Math.max(0, Math.min(1, building.buildProgress / building.buildTime))
  const site = new Graphics()
    .rect(center.x - 21 * scale, center.y - 15 * scale, 42 * scale, 34 * scale)
    .fill(0x7a5634)
    .rect(center.x - 18 * scale, center.y - 23 * scale, 8 * scale, 42 * scale)
    .fill(PALETTE.wood)
    .rect(center.x + 10 * scale, center.y - 23 * scale, 8 * scale, 42 * scale)
    .fill(PALETTE.wood)
    .rect(center.x - 24 * scale, center.y - 18 * scale, 48 * scale, 7 * scale)
    .fill(PALETTE.parchmentDark)
    .rect(center.x - 22, center.y + 24, 44, 6)
    .fill(PALETTE.panelDark)
    .rect(center.x - 22, center.y + 24, 44 * progress, 6)
    .fill(PALETTE.gold)
  layer.addChild(site)
}

function drawVillager(layer: Container, villager: Villager): void {
  const bob = Math.sin(villager.stepTime) * 2
  const x = Math.round(villager.position.x)
  const y = Math.round(villager.position.y + bob)
  const bodyColor = villager.task.kind === 'defend' ? PALETTE.blue : villager.task.kind === 'build' ? PALETTE.gold : 0x5f8f46
  const villagerGraphic = new Graphics()
    .rect(x - 7, y - 18, 14, 18)
    .fill(bodyColor)
    .rect(x - 9, y - 28, 18, 12)
    .fill(0xd49a6a)
    .rect(x - 10, y - 34, 20, 7)
    .fill(0x755035)
    .rect(x - 4, y - 24, 3, 3)
    .fill(PALETTE.deepInk)
    .rect(x + 3, y - 24, 3, 3)
    .fill(PALETTE.deepInk)
  layer.addChild(villagerGraphic)

  if (villager.carried) {
    const carried = new Graphics()
      .rect(x + 8, y - 14, 9, 9)
      .fill(resourceColor(villager.carried))
    layer.addChild(carried)
  }

  drawTaskIcon(layer, villager.task.kind, x, y - 47)
}

function drawTaskIcon(layer: Container, task: Villager['task']['kind'], x: number, y: number): void {
  if (task === 'idle') return

  const icon = new Graphics()
    .rect(x - 12, y - 9, 24, 18)
    .fill(PALETTE.parchment)
    .rect(x - 12, y - 9, 24, 18)
    .stroke({ color: PALETTE.panelDark, width: 2 })

  if (task === 'gather') {
    icon.rect(x - 6, y - 1, 12, 4).fill(PALETTE.wood).rect(x + 2, y - 6, 5, 5).fill(PALETTE.stone)
  } else if (task === 'build') {
    icon.rect(x - 7, y - 3, 14, 5).fill(PALETTE.wood).rect(x + 2, y - 7, 5, 13).fill(PALETTE.stone)
  } else {
    icon.rect(x - 6, y - 5, 12, 12).fill(PALETTE.blue).rect(x - 3, y - 2, 6, 6).fill(PALETTE.white)
  }
  layer.addChild(icon)
}

function drawTinyKing(layer: Container, position: Vector, scale: number, stepTime: number): void {
  const bob = Math.sin(stepTime) * 2 * scale
  const x = Math.round(position.x)
  const y = Math.round(position.y + bob)
  const king = new Graphics()
    .rect(x - 7 * scale, y - 18 * scale, 14 * scale, 20 * scale)
    .fill(0x345aa4)
    .rect(x - 10 * scale, y - 8 * scale, 20 * scale, 22 * scale)
    .fill(0xb84c3c)
    .rect(x - 8 * scale, y - 30 * scale, 16 * scale, 14 * scale)
    .fill(0xf1b980)
    .rect(x - 10 * scale, y - 38 * scale, 20 * scale, 8 * scale)
    .fill(PALETTE.gold)
    .rect(x - 6 * scale, y - 44 * scale, 4 * scale, 7 * scale)
    .fill(PALETTE.gold)
    .rect(x + 2 * scale, y - 44 * scale, 4 * scale, 7 * scale)
    .fill(PALETTE.gold)
    .rect(x - 4 * scale, y - 25 * scale, 3 * scale, 3 * scale)
    .fill(PALETTE.deepInk)
    .rect(x + 4 * scale, y - 25 * scale, 3 * scale, 3 * scale)
    .fill(PALETTE.deepInk)
  layer.addChild(king)
}

function drawHazard(layer: Container, hazard: Hazard): void {
  const x = Math.round(hazard.position.x)
  const y = Math.round(hazard.position.y)
  const alpha = hazard.state === 'fleeing' ? 0.72 : 1
  const color = hazard.hitFlash > 0 ? PALETTE.dangerLight : PALETTE.danger
  const hazardGraphic = new Graphics()
    .rect(x - 16, y - 10, 32, 22)
    .fill({ color, alpha })
    .rect(x - 20, y - 3, 8, 12)
    .fill({ color, alpha })
    .rect(x + 12, y - 3, 8, 12)
    .fill({ color, alpha })
    .rect(x - 8, y - 16, 6, 7)
    .fill({ color: PALETTE.dangerLight, alpha })
    .rect(x + 2, y - 16, 6, 7)
    .fill({ color: PALETTE.dangerLight, alpha })
    .rect(x - 7, y - 4, 4, 4)
    .fill(PALETTE.gold)
    .rect(x + 4, y - 4, 4, 4)
    .fill(PALETTE.gold)
    .rect(x - 18, y + 17, 36, 5)
    .fill(PALETTE.panelDark)
    .rect(x - 18, y + 17, 36 * Math.max(0, hazard.health / hazard.maxHealth), 5)
    .fill(PALETTE.dangerLight)
  layer.addChild(hazardGraphic)
}

function drawSpawnWarning(layer: Container, warning: SpawnWarning): void {
  const progress = warning.timer / warning.maxTimer
  const pulse = Math.sin(progress * Math.PI * 8) * 0.5 + 0.5
  const marker = new Graphics()
    .rect(warning.position.x - 15, warning.position.y - 22, 30, 30)
    .fill({ color: PALETTE.danger, alpha: 0.35 + pulse * 0.3 })
    .rect(warning.position.x - 3, warning.position.y - 18, 6, 18)
    .fill(PALETTE.white)
    .rect(warning.position.x - 3, warning.position.y + 4, 6, 6)
    .fill(PALETTE.white)
  layer.addChild(marker)
}

function drawAttackEffect(layer: Container, effect: AttackEffect): void {
  const alpha = effect.life / effect.maxLife
  const beam = new Graphics()
    .moveTo(effect.from.x, effect.from.y - 24)
    .lineTo(effect.to.x, effect.to.y - 8)
    .stroke({ color: effect.color, alpha, width: 4 })
    .moveTo(effect.to.x - 6, effect.to.y - 8)
    .lineTo(effect.to.x + 6, effect.to.y - 8)
    .moveTo(effect.to.x, effect.to.y - 14)
    .lineTo(effect.to.x, effect.to.y - 2)
    .stroke({ color: PALETTE.white, alpha, width: 2 })
  layer.addChild(beam)
}

function drawCampHitFlash(layer: Container, flash: number): void {
  if (flash <= 0) return

  const camp = tileToScreen({ column: Math.floor(WORLD_COLUMNS / 2), row: Math.floor(WORLD_ROWS / 2) })
  const alpha = Math.min(0.5, flash * 1.2)
  const marker = new Graphics()
    .rect(camp.x - 36, camp.y - 34, 72, 72)
    .stroke({ color: PALETTE.dangerLight, alpha, width: 5 })
    .rect(camp.x - 24, camp.y - 22, 48, 48)
    .fill({ color: PALETTE.dangerLight, alpha: alpha * 0.22 })
  layer.addChild(marker)
}

function drawTree(layer: Container, x: number, y: number, scale: number): void {
  const tree = new Graphics()
    .rect(x - 5 * scale, y - 8 * scale, 10 * scale, 22 * scale)
    .fill(PALETTE.wood)
    .rect(x - 18 * scale, y - 30 * scale, 36 * scale, 25 * scale)
    .fill(PALETTE.forest)
    .rect(x - 13 * scale, y - 38 * scale, 26 * scale, 18 * scale)
    .fill(PALETTE.grassDark)
    .rect(x - 7 * scale, y - 45 * scale, 14 * scale, 12 * scale)
    .fill(PALETTE.grass)
  layer.addChild(tree)
}

function drawRock(layer: Container, x: number, y: number): void {
  const rock = new Graphics()
    .rect(x - 17, y - 18, 34, 28)
    .fill(PALETTE.stone)
    .rect(x - 7, y - 28, 22, 13)
    .fill(0xc0c4bd)
    .rect(x - 17, y + 3, 34, 8)
    .fill(0x747b7b)
  layer.addChild(rock)
}

function drawBerryBush(layer: Container, x: number, y: number, scale: number): void {
  const bush = new Graphics()
    .rect(x - 17 * scale, y - 24 * scale, 34 * scale, 27 * scale)
    .fill(PALETTE.grassDark)
    .rect(x - 10 * scale, y - 31 * scale, 20 * scale, 16 * scale)
    .fill(PALETTE.grass)
    .rect(x - 11 * scale, y - 19 * scale, 6 * scale, 6 * scale)
    .fill(PALETTE.berry)
    .rect(x + 5 * scale, y - 25 * scale, 6 * scale, 6 * scale)
    .fill(PALETTE.berry)
  layer.addChild(bush)
}

function drawPanel(layer: Container, x: number, y: number, width: number, height: number): void {
  const panel = new Graphics()
    .rect(x, y, width, height)
    .fill(PALETTE.panelDark)
    .rect(x + 5, y + 5, width - 10, height - 10)
    .fill(PALETTE.panel)
    .rect(x + 10, y + 10, width - 20, height - 20)
    .fill({ color: PALETTE.parchment, alpha: 0.22 })
  layer.addChild(panel)
}

function centeredText(text: string, x: number, y: number, style: TextStyle): Text {
  const display = new Text({ text, style })
  display.anchor.set(0.5)
  display.position.set(x, y)
  return display
}

function multilineText(lines: string[], x: number, y: number, style: TextStyle, lineHeight: number): Text[] {
  return lines.map((line, index) => {
    const text = new Text({ text: line, style })
    text.position.set(x, y + index * lineHeight)
    return text
  })
}

function tileToScreen(tile: Pick<Tile, 'column' | 'row'>): Vector {
  return {
    x: WORLD_OFFSET_X + tile.column * TILE_SIZE + TILE_SIZE / 2,
    y: WORLD_OFFSET_Y + tile.row * TILE_SIZE + TILE_SIZE / 2,
  }
}

function resourceLine(resources: ResourceStock): string {
  return `Wood ${resources.wood}   Stone ${resources.stone}   Food ${resources.food}   Gold ${resources.gold}`
}

function compactCost(cost: ResourceStock): string {
  return (Object.entries(cost) as Array<[ResourceKind, number]>)
    .filter(([, value]) => value > 0)
    .map(([kind, value]) => `${kind[0].toUpperCase()}${value}`)
    .join(' ')
}

function resourceColor(kind: ResourceKind): number {
  if (kind === 'wood') return PALETTE.wood
  if (kind === 'stone') return PALETTE.stone
  if (kind === 'food') return PALETTE.berry
  return PALETTE.gold
}

function priorityColor(priority: TaskPriority): number {
  if (priority === 'gather') return PALETTE.forest
  if (priority === 'build') return PALETTE.wood
  return PALETTE.blue
}

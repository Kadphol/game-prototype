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
  Building,
  BuildingKind,
  GameResult,
  GameSnapshot,
  Hazard,
  ResourceKind,
  ResourceNode,
  ResourceStock,
  Tile,
  Vector,
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
        'Move: WASD / Arrow Keys',
        'Gather: E near trees, rocks, and berry bushes',
        'Build: 1 Hut, 2 Farm, 3 Watchtower',
        'Place: Space / Enter on an empty grass tile',
      ],
      centerX - 255,
      298,
      textStyles.dark,
      27
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

    for (const node of snapshot.nodes) {
      drawResourceNode(this.worldLayer, node)
    }

    const sortedBuildings = [...snapshot.buildings].sort((a, b) => a.row - b.row)
    for (const building of sortedBuildings) {
      drawBuilding(this.worldLayer, building)
    }

    for (const hazard of snapshot.hazards) {
      drawHazard(this.worldLayer, hazard)
    }

    drawTinyKing(this.worldLayer, snapshot.player.position, 1.35, snapshot.player.stepTime)
  }

  private drawPlacementGhost(snapshot: GameSnapshot): void {
    if (!snapshot.hoveredTile) return

    const center = tileToScreen(snapshot.hoveredTile)
    const color = snapshot.canPlaceHovered ? PALETTE.gold : PALETTE.dangerLight
    const ghost = new Graphics()
      .rect(center.x - TILE_SIZE / 2 + 4, center.y - TILE_SIZE / 2 + 4, TILE_SIZE - 8, TILE_SIZE - 8)
      .stroke({ color, alpha: 0.9, width: 3 })
      .rect(center.x - 12, center.y - 12, 24, 24)
      .fill({ color, alpha: snapshot.canPlaceHovered ? 0.25 : 0.18 })
    this.worldLayer.addChild(ghost)
  }

  private drawEffects(snapshot: GameSnapshot): void {
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
    drawPanel(this.hudLayer, 22, 16, 790, 62)
    const resources = resourceLine(snapshot.resources)
    const resourceText = new Text({
      text: resources,
      style: textStyles.small,
    })
    resourceText.position.set(44, 36)
    this.hudLayer.addChild(resourceText)

    const dayProgress = 1 - snapshot.dayTimer / DAY_LENGTH_SECONDS
    drawPanel(this.hudLayer, 838, 16, 420, 62)
    const dayText = new Text({
      text: `Day ${snapshot.day}/${MAX_DAYS}  Prosperity ${snapshot.prosperity}/${WIN_PROSPERITY}`,
      style: textStyles.small,
    })
    dayText.position.set(860, 30)
    const dayBar = new Graphics()
      .rect(860, 57, 360, 8)
      .fill(PALETTE.panelDark)
      .rect(860, 57, 360 * dayProgress, 8)
      .fill(snapshot.dayTimer < DAY_LENGTH_SECONDS * 0.35 ? PALETTE.dangerLight : PALETTE.gold)
    this.hudLayer.addChild(dayText, dayBar)

    drawPanel(this.hudLayer, 22, 94, 128, 108)
    const moraleText = multilineText([`Pop ${snapshot.population}`, `Morale ${snapshot.morale}`], 42, 118, textStyles.small, 30)
    this.hudLayer.addChild(...moraleText)

    drawPanel(this.hudLayer, 948, 590, 310, 104)
    const objective = multilineText(
      ['Objective', 'Reach 100 prosperity', 'before Day 5 ends.'],
      970,
      610,
      textStyles.small,
      24
    )
    this.hudLayer.addChild(...objective)

    drawPanel(this.hudLayer, 260, 594, 604, 104)
    BUILDING_ORDER.forEach((kind, index) => {
      this.drawBuildButton(kind, snapshot.selectedBuilding === kind, 282 + index * 190, 614, snapshot.resources)
    })

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
      .rect(x, y, 168, 62)
      .fill(selected ? PALETTE.gold : affordable ? PALETTE.parchment : 0x8c7756)
      .rect(x + 4, y + 4, 160, 54)
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
  const hazardGraphic = new Graphics()
    .rect(x - 16, y - 10, 32, 22)
    .fill({ color: PALETTE.danger, alpha })
    .rect(x - 20, y - 3, 8, 12)
    .fill({ color: PALETTE.danger, alpha })
    .rect(x + 12, y - 3, 8, 12)
    .fill({ color: PALETTE.danger, alpha })
    .rect(x - 8, y - 16, 6, 7)
    .fill({ color: PALETTE.dangerLight, alpha })
    .rect(x + 2, y - 16, 6, 7)
    .fill({ color: PALETTE.dangerLight, alpha })
    .rect(x - 7, y - 4, 4, 4)
    .fill(PALETTE.gold)
    .rect(x + 4, y - 4, 4, 4)
    .fill(PALETTE.gold)
  layer.addChild(hazardGraphic)
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

import {
  BUILDING_ORDER,
  BUILDINGS,
  DAY_LENGTH_SECONDS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_DAYS,
  PALETTE,
  TILE_SIZE,
  UPGRADES,
  UPGRADE_ORDER,
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
  RendererCommand,
  UpgradeBranchDefinition,
  UpgradeKind,
  Vector,
  Villager,
} from './types'

import {
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
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

const buttonTextStyles = {
  dark: new TextStyle({ fontFamily, fontSize: 14, fill: PALETTE.deepInk, fontWeight: '900' }),
  light: new TextStyle({ fontFamily, fontSize: 14, fill: PALETTE.white, fontWeight: '900' }),
  compactDark: new TextStyle({ fontFamily, fontSize: 11, fill: PALETTE.deepInk, fontWeight: '900' }),
  compactLight: new TextStyle({ fontFamily, fontSize: 11, fill: PALETTE.white, fontWeight: '900' }),
  subDark: new TextStyle({ fontFamily, fontSize: 11, fill: PALETTE.deepInk, fontWeight: '900' }),
  subLight: new TextStyle({ fontFamily, fontSize: 11, fill: PALETTE.white, fontWeight: '900' }),
}

const PRIORITY_ORDER: TaskPriority[] = ['gather', 'build', 'defend']

export interface RendererPerformanceStats {
  fps: number
  frameMs: number
  commandSource: string
}

export interface RendererObjectCounts {
  stage: number
  world: number
  effects: number
  hud: number
  overlay: number
}

export class KingdomRenderer {
  readonly stage = new Container()
  private readonly backgroundLayer = new Container()
  private readonly backgroundPattern = new Graphics()
  private readonly nightOverlay = new Graphics()
  private readonly terrainLayer = new Container()
  private readonly worldLayer = new Container()
  private readonly effectLayer = new Container()
  private readonly hudLayer = new Container()
  private readonly overlayLayer = new Container()
  private pointerPosition: Vector = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }
  private pointerCursorTile?: Pick<Tile, 'column' | 'row'>
  private pointerPlaceQueued = false
  private queuedCommand: RendererCommand = {}
  private terrainReady = false
  private readonly hud: PersistentHud

  constructor(private readonly app: Application) {
    this.backgroundLayer.addChild(this.backgroundPattern, this.nightOverlay)
    this.stage.addChild(this.backgroundLayer, this.terrainLayer, this.worldLayer, this.effectLayer, this.hudLayer, this.overlayLayer)
    this.stage.eventMode = 'static'
    this.stage.hitArea = app.screen
    drawBackdropPattern(this.backgroundPattern)
    this.stage.on('pointermove', this.handlePointerMove)
    this.stage.on('pointerdown', this.handlePointerDown)
    this.hud = new PersistentHud((command) => this.queueCommand(command))
    this.hudLayer.addChild(this.hud.container)
  }

  destroy(): void {
    this.stage.off('pointermove', this.handlePointerMove)
    this.stage.off('pointerdown', this.handlePointerDown)
    this.stage.destroy({ children: true })
  }

  renderStart(): void {
    this.terrainLayer.visible = false
    this.hud.container.visible = false
    this.clearDynamic()
    drawNightOverlay(this.nightOverlay, 0)

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
        'Move cursor: WASD / Arrow Keys or mouse hover',
        'Tap/click a valid tile to place the current plan',
        'Villagers gather, build, and defend automatically',
        'Priority: Q/E cycle or G Gather, B Build, F Defend',
        'Build: 1 Hut, 2 Farm, 3 Watchtower',
        'Upgrades: 4 Boots, 5 Arrows, 6 Seeds',
      ],
      centerX - 290,
      278,
      textStyles.dark,
      24
    )
    const startButton = makeInteractiveButton({
      x: centerX - 170,
      y: 414,
      width: 340,
      height: 48,
      label: 'Press Enter / Tap to Start',
      selected: true,
      affordable: true,
      onPress: (event) => {
        event.stopPropagation()
        this.queueCommand({ start: true, source: 'canvas-start' })
      },
    })

    this.overlayLayer.addChild(title, subtitle, ...controls, startButton)
    drawTinyKing(this.overlayLayer, { x: centerX, y: 548 }, 2.8, 0)
    drawTree(this.overlayLayer, centerX - 145, 570, 1.3)
    drawBerryBush(this.overlayLayer, centerX + 138, 578, 1.3)
  }

  renderGame(snapshot: GameSnapshot, debugVisible = false, performanceStats: RendererPerformanceStats = { fps: 0, frameMs: 0, commandSource: 'none' }): void {
    this.terrainLayer.visible = true
    this.hud.container.visible = true
    this.ensureTerrain(snapshot.tiles)
    this.clearDynamic()
    drawNightOverlay(this.nightOverlay, snapshot.dayTimer / DAY_LENGTH_SECONDS)

    // A tiny camera shake sells camp damage without complicating the simulation.
    const shake = snapshot.cameraShake > 0 ? Math.sin(performance.now() / 20) * snapshot.cameraShake * 16 : 0
    this.worldLayer.position.set(shake, -shake * 0.45)
    this.effectLayer.position.set(shake, -shake * 0.45)

    this.drawWorld(snapshot)
    this.drawEffects(snapshot)
    this.hud.update(snapshot, debugVisible, {
      ...performanceStats,
      worldObjects: this.worldLayer.children.length,
      effectObjects: this.effectLayer.children.length,
      hudObjects: this.hud.objectCount(),
    })

    if (snapshot.phase === 'gameOver' && snapshot.result) {
      this.drawGameOver(snapshot.result)
    }
  }

  pointer(): Vector {
    return this.pointerPosition
  }

  objectCounts(): RendererObjectCounts {
    return {
      stage: this.stage.children.length,
      world: this.worldLayer.children.length,
      effects: this.effectLayer.children.length,
      hud: this.hud.objectCount(),
      overlay: this.overlayLayer.children.length,
    }
  }

  consumePointerCommand(): RendererCommand {
    const command = {
      ...this.queuedCommand,
      cursorTile: this.pointerCursorTile ? { ...this.pointerCursorTile } : undefined,
      place: this.pointerPlaceQueued || Boolean(this.queuedCommand.place),
    }
    this.queuedCommand = {}
    this.pointerPlaceQueued = false
    return command
  }

  private queueCommand(command: RendererCommand): void {
    this.queuedCommand = {
      ...this.queuedCommand,
      ...command,
      place: Boolean(this.queuedCommand.place || command.place),
      priorityCycle: (this.queuedCommand.priorityCycle ?? 0) + (command.priorityCycle ?? 0),
      source: command.source ?? this.queuedCommand.source,
    }
  }

  private drawWorld(snapshot: GameSnapshot): void {
    this.drawPlacementGhost(snapshot)

    for (const warning of snapshot.spawnWarnings) {
      drawSpawnWarning(this.worldLayer, warning)
    }

    for (const node of snapshot.nodes) {
      drawResourceNode(this.worldLayer, node)
    }

    for (const building of snapshot.buildings) {
      drawBuilding(this.worldLayer, building)
    }

    for (const villager of snapshot.villagers) {
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

  private drawGameOver(result: GameResult): void {
    const veil = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: PALETTE.deepInk, alpha: 0.64 })
    drawPanel(this.overlayLayer, 342, 166, 596, 360)

    const title = centeredText(result.title, GAME_WIDTH / 2, 220, textStyles.title)
    title.tint = result.won ? PALETTE.gold : PALETTE.dangerLight
    const reason = centeredText(result.reason, GAME_WIDTH / 2, 292, textStyles.subtitle)
    const score = centeredText(`Score ${result.score}`, GAME_WIDTH / 2, 354, textStyles.body)
    const restart = makeInteractiveButton({
      x: GAME_WIDTH / 2 - 150,
      y: 416,
      width: 300,
      height: 48,
      label: 'Press R / Tap Restart',
      selected: true,
      affordable: true,
      onPress: (event) => {
        event.stopPropagation()
        this.queueCommand({ restart: true, source: 'canvas-restart' })
      },
    })

    this.overlayLayer.addChild(veil, title, reason, score, restart)
  }

  private ensureTerrain(tiles: Tile[]): void {
    if (this.terrainReady) return

    destroyChildren(this.terrainLayer)
    for (const tile of tiles) {
      drawTerrainTile(this.terrainLayer, tile)
    }
    this.terrainReady = true
  }

  private clearDynamic(): void {
    destroyChildren(this.worldLayer)
    destroyChildren(this.effectLayer)
    destroyChildren(this.overlayLayer)
    this.worldLayer.position.set(0, 0)
    this.effectLayer.position.set(0, 0)
  }

  private readonly handlePointerMove = (event: FederatedPointerEvent): void => {
    this.pointerPosition = { x: event.global.x, y: event.global.y }
    this.pointerCursorTile = screenToTile(this.pointerPosition)
  }

  private readonly handlePointerDown = (event: FederatedPointerEvent): void => {
    this.app.canvas.focus()
    this.pointerPosition = { x: event.global.x, y: event.global.y }
    this.pointerCursorTile = screenToTile(this.pointerPosition)
    this.pointerPlaceQueued = this.pointerCursorTile !== undefined
    if (this.pointerPlaceQueued) {
      this.queuedCommand.source = 'canvas-world'
    }
  }
}

interface HudPerformanceStats extends RendererPerformanceStats {
  worldObjects: number
  effectObjects: number
  hudObjects: number
}

interface ButtonUpdate {
  label: string
  sublabel?: string
  selected?: boolean
  affordable?: boolean
  disabled?: boolean
  fill?: number
}

interface ButtonOptions extends ButtonUpdate {
  x: number
  y: number
  width: number
  height: number
  onPress: (event: FederatedPointerEvent) => void
}

class HudButton {
  readonly container = new Container()
  private readonly background = new Graphics()
  private readonly label = new Text({ text: '', style: buttonTextStyles.dark })
  private readonly sublabel = new Text({ text: '', style: buttonTextStyles.subDark })

  constructor(private readonly options: ButtonOptions) {
    this.container.position.set(options.x, options.y)
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.hitArea = new Rectangle(0, 0, options.width, options.height)
    this.container.on('pointertap', options.onPress)
    this.label.position.set(8, options.height <= 28 ? 6 : 7)
    this.sublabel.position.set(8, options.height - 19)
    this.container.addChild(this.background, this.label, this.sublabel)
    this.update(options)
  }

  update(update: ButtonUpdate): void {
    const selected = Boolean(update.selected)
    const disabled = Boolean(update.disabled)
    const affordable = update.affordable !== false
    const fill = update.fill ?? (selected ? PALETTE.gold : affordable && !disabled ? PALETTE.parchment : 0x8c7756)
    const useDarkText = selected || affordable

    this.background.clear()
    this.background
      .rect(0, 0, this.options.width, this.options.height)
      .fill({ color: fill, alpha: disabled ? 0.68 : 1 })
      .rect(4, 4, this.options.width - 8, this.options.height - 8)
      .stroke({ color: selected ? PALETTE.white : PALETTE.panelDark, width: this.options.height <= 28 ? 2 : 3 })
    this.label.text = update.label
    this.label.style = this.options.height <= 28
      ? useDarkText ? buttonTextStyles.compactDark : buttonTextStyles.compactLight
      : useDarkText ? buttonTextStyles.dark : buttonTextStyles.light
    this.sublabel.text = update.sublabel ?? ''
    this.sublabel.style = useDarkText ? buttonTextStyles.subDark : buttonTextStyles.subLight
    this.sublabel.visible = Boolean(update.sublabel)
    this.container.alpha = disabled ? 0.72 : 1
  }
}

class PersistentHud {
  readonly container = new Container()
  private readonly resourcesText = new Text({ text: '', style: textStyles.small })
  private readonly bars = new Graphics()
  private readonly dayText = new Text({ text: '', style: textStyles.small })
  private readonly objectiveText = new Text({ text: '', style: textStyles.small })
  private readonly prioritySummary = new Text({ text: '', style: textStyles.tiny })
  private readonly queueText = new Text({ text: '', style: textStyles.tiny })
  private readonly planText = new Text({ text: '', style: textStyles.tiny })
  private readonly upgradeTitle = new Text({ text: '', style: textStyles.tiny })
  private readonly branchHint = new Text({ text: '', style: textStyles.tiny })
  private readonly statusText = centeredText('', GAME_WIDTH / 2, 486, textStyles.body)
  private readonly debugOverlay = new Container()
  private readonly debugBackground = new Graphics()
  private readonly debugText = new Text({ text: '', style: textStyles.tiny })
  private readonly buildButtons = new Map<BuildingKind, HudButton>()
  private readonly priorityButtons = new Map<TaskPriority, HudButton>()
  private readonly upgradeButtons = new Map<UpgradeKind, HudButton>()
  private readonly branchButtons: HudButton[] = []
  private readonly placeButton: HudButton
  private readonly debugButton: HudButton
  private selectedUpgrade: UpgradeKind = 'villagerSpeed'

  constructor(private readonly queueCommand: (command: RendererCommand) => void) {
    this.container.addChild(panelGraphic(22, 16, 774, 62), panelGraphic(818, 16, 440, 62), panelGraphic(1014, 94, 244, 178))
    this.container.addChild(panelGraphic(22, 574, 286, 122), panelGraphic(320, 574, 440, 122), panelGraphic(778, 502, 480, 194))

    this.resourcesText.position.set(44, 36)
    this.dayText.position.set(840, 30)
    this.objectiveText.position.set(1036, 116)
    this.prioritySummary.position.set(42, 594)
    this.queueText.position.set(42, 662)
    this.planText.position.set(342, 592)
    this.upgradeTitle.position.set(800, 522)
    this.branchHint.position.set(946, 522)
    this.debugOverlay.position.set(22, 92)
    this.debugOverlay.visible = false
    this.debugText.position.set(14, 12)
    this.debugOverlay.addChild(this.debugBackground, this.debugText)

    PRIORITY_ORDER.forEach((priority, index) => {
      const button = new HudButton({
        x: 42 + index * 84,
        y: 624,
        width: 76,
        height: 34,
        label: priority.toUpperCase(),
        fill: priorityColor(priority),
        onPress: (event) => {
          event.stopPropagation()
          this.queueCommand({ selectedPriority: priority, source: `canvas-priority-${priority}` })
        },
      })
      this.priorityButtons.set(priority, button)
      this.container.addChild(button.container)
    })

    BUILDING_ORDER.forEach((kind, index) => {
      const definition = BUILDINGS[kind]
      const button = new HudButton({
        x: 342 + index * 132,
        y: 626,
        width: 122,
        height: 52,
        label: `${definition.hotkey} ${definition.label}`,
        sublabel: compactCost(definition.cost),
        onPress: (event) => {
          event.stopPropagation()
          this.queueCommand({ selectedBuilding: kind, source: `canvas-build-${kind}` })
        },
      })
      this.buildButtons.set(kind, button)
      this.container.addChild(button.container)
    })

    this.placeButton = new HudButton({
      x: 666,
      y: 588,
      width: 76,
      height: 30,
      label: 'PLACE',
      onPress: (event) => {
        event.stopPropagation()
        this.queueCommand({ place: true, source: 'canvas-place' })
      },
    })
    this.container.addChild(this.placeButton.container)

    UPGRADE_ORDER.forEach((kind, index) => {
      const definition = UPGRADES[kind]
      const button = new HudButton({
        x: 800,
        y: 548 + index * 43,
        width: 132,
        height: 34,
        label: `${definition.hotkey} ${definition.label}`,
        onPress: (event) => {
          event.stopPropagation()
          this.selectedUpgrade = kind
          this.queueCommand({ upgradePurchase: { kind }, source: `canvas-upgrade-${kind}` })
        },
      })
      this.upgradeButtons.set(kind, button)
      this.container.addChild(button.container)
    })

    for (let index = 0; index < 2; index += 1) {
      const button = new HudButton({
        x: 946,
        y: 550 + index * 57,
        width: 286,
        height: 46,
        label: '',
        onPress: (event) => {
          event.stopPropagation()
          const branch = UPGRADES[this.selectedUpgrade].branches[index]
          if (branch) {
            this.queueCommand({ upgradePurchase: { kind: this.selectedUpgrade, branch: branch.kind }, source: `canvas-branch-${branch.kind}` })
          }
        },
      })
      this.branchButtons.push(button)
      this.container.addChild(button.container)
    }

    this.debugButton = new HudButton({
      x: 1200,
      y: 94,
      width: 42,
      height: 28,
      label: 'DBG',
      onPress: (event) => {
        event.stopPropagation()
        this.queueCommand({ debugToggle: true, source: 'canvas-debug' })
      },
    })
    this.container.addChild(this.bars, this.resourcesText, this.dayText, this.objectiveText, this.prioritySummary, this.queueText, this.planText, this.upgradeTitle, this.branchHint, this.statusText, this.debugButton.container, this.debugOverlay)
  }

  update(snapshot: GameSnapshot, debugVisible: boolean, stats: HudPerformanceStats): void {
    this.selectedUpgrade = snapshot.selectedUpgrade
    const dayProgress = 1 - snapshot.dayTimer / DAY_LENGTH_SECONDS
    this.resourcesText.text = resourceLine(snapshot.resources)
    this.dayText.text = `Day ${snapshot.day}/${MAX_DAYS}  Morale ${snapshot.morale}%`
    this.objectiveText.text = [
      'Objective',
      `Prosperity ${snapshot.prosperity}/${WIN_PROSPERITY}`,
      'before Day 5 ends.',
      `Villagers ${snapshot.villagers.length}/${snapshot.population}`,
    ].join('\n')

    this.bars.clear()
    this.bars
      .rect(840, 57, 170, 8)
      .fill(PALETTE.panelDark)
      .rect(840, 57, 170 * dayProgress, 8)
      .fill(snapshot.dayTimer < DAY_LENGTH_SECONDS * 0.35 ? PALETTE.dangerLight : PALETTE.gold)
      .rect(1036, 57, 170, 8)
      .fill(PALETTE.panelDark)
      .rect(1036, 57, 170 * Math.max(0, snapshot.morale / 100), 8)
      .fill(snapshot.morale > 40 ? PALETTE.grassLight : PALETTE.dangerLight)

    this.prioritySummary.text = `Priority  I${snapshot.jobCounts.idle} G${snapshot.jobCounts.gather} B${snapshot.jobCounts.build} D${snapshot.jobCounts.defend} C${snapshot.jobCounts.carrying}`
    this.queueText.text = `Queue ${snapshot.queuePreview.constructions} build ${Math.round(snapshot.queuePreview.constructionProgress * 100)}% | Threat ${snapshot.queuePreview.hazards}+${snapshot.queuePreview.warnings} | Need ${snapshot.queuePreview.nextResource}`
    const selectedBuilding = BUILDINGS[snapshot.selectedBuilding]
    this.planText.text = `${selectedBuilding.label} plan  Cost ${compactCost(selectedBuilding.cost)}  ${snapshot.canPlaceHovered ? 'valid site' : 'blocked/unaffordable'}`

    for (const priority of PRIORITY_ORDER) {
      this.priorityButtons.get(priority)?.update({
        label: priority.toUpperCase(),
        selected: snapshot.priority === priority,
        affordable: true,
        fill: snapshot.priority === priority ? PALETTE.gold : priorityColor(priority),
      })
    }

    for (const kind of BUILDING_ORDER) {
      const definition = BUILDINGS[kind]
      this.buildButtons.get(kind)?.update({
        label: `${definition.hotkey} ${definition.label}`,
        sublabel: compactCost(definition.cost),
        selected: snapshot.selectedBuilding === kind,
        affordable: canAfford(snapshot.resources, definition.cost),
      })
    }
    this.placeButton.update({ label: 'PLACE', selected: snapshot.canPlaceHovered, affordable: snapshot.canPlaceHovered })

    this.updateUpgradePanel(snapshot)
    this.statusText.text = snapshot.statusTimer > 0 ? snapshot.statusMessage : ''
    this.statusText.visible = snapshot.statusTimer > 0
    this.statusText.tint = snapshot.statusMessage.includes('Need') || snapshot.statusMessage.includes('Cannot') || snapshot.statusMessage.includes('first') ? PALETTE.dangerLight : PALETTE.white

    this.debugButton.update({ label: debugVisible ? 'DBG*' : 'DBG', selected: debugVisible, affordable: true })
    this.debugOverlay.visible = debugVisible
    if (debugVisible) {
      this.debugBackground.clear()
      this.debugBackground.rect(0, 0, 356, 168).fill({ color: PALETTE.deepInk, alpha: 0.82 }).rect(5, 5, 346, 158).stroke({ color: PALETTE.gold, width: 2 })
      this.debugText.text = [
        `FPS ${stats.fps.toFixed(0)}  Frame ${stats.frameMs.toFixed(1)}ms`,
        `Objects W${stats.worldObjects} E${stats.effectObjects} H${stats.hudObjects}`,
        `Villagers ${snapshot.debugCounts.villagers} Buildings ${snapshot.debugCounts.buildings} Hazards ${snapshot.debugCounts.hazards}`,
        `Particles ${snapshot.debugCounts.particles} Text ${snapshot.debugCounts.floatingTexts} Bolts ${snapshot.debugCounts.attackEffects}`,
        `Command ${stats.commandSource}`,
      ].join('\n')
    }
  }

  objectCount(): number {
    return this.container.children.length + this.debugOverlay.children.length
  }

  private updateUpgradePanel(snapshot: GameSnapshot): void {
    const selectedDefinition = UPGRADES[this.selectedUpgrade]
    const selectedTrack = snapshot.upgrades[this.selectedUpgrade]
    this.upgradeTitle.text = `Upgrades: ${selectedDefinition.label}`
    this.branchHint.text = selectedTrack.basePurchased
      ? selectedTrack.branch ? 'Branch chosen. Alternate locked.' : 'Choose one branch.'
      : `Prereq: ${selectedDefinition.baseLabel}`

    for (const kind of UPGRADE_ORDER) {
      const definition = UPGRADES[kind]
      const track = snapshot.upgrades[kind]
      const cost = track.basePurchased ? undefined : definition.baseCost
      this.upgradeButtons.get(kind)?.update({
        label: `${definition.hotkey} ${definition.label}`,
        sublabel: track.basePurchased ? track.branch ? branchLabel(kind, track.branch) : 'branch ready' : compactCost(definition.baseCost),
        selected: this.selectedUpgrade === kind,
        affordable: !cost || canAfford(snapshot.resources, cost),
        fill: track.basePurchased ? PALETTE.grassDark : undefined,
      })
    }

    selectedDefinition.branches.forEach((branch, index) => {
      this.updateBranchButton(this.branchButtons[index], snapshot, branch)
    })
  }

  private updateBranchButton(button: HudButton | undefined, snapshot: GameSnapshot, branch: UpgradeBranchDefinition): void {
    if (!button) return

    const track = snapshot.upgrades[this.selectedUpgrade]
    const chosen = track.branch === branch.kind
    const lockedByChoice = Boolean(track.branch && !chosen)
    const lockedByPrereq = !track.basePurchased
    button.update({
      label: branch.label,
      sublabel: lockedByPrereq ? `Needs base | ${compactCost(branch.cost)}` : chosen ? 'Chosen' : lockedByChoice ? 'Locked' : compactCost(branch.cost),
      selected: chosen,
      affordable: track.basePurchased && !lockedByChoice && canAfford(snapshot.resources, branch.cost),
      disabled: lockedByPrereq || lockedByChoice,
      fill: chosen ? PALETTE.gold : lockedByChoice ? PALETTE.panelDark : undefined,
    })
  }
}

function makeInteractiveButton(options: ButtonOptions): Container {
  return new HudButton(options).container
}

function panelGraphic(x: number, y: number, width: number, height: number): Graphics {
  return new Graphics()
    .rect(x, y, width, height)
    .fill(PALETTE.panelDark)
    .rect(x + 5, y + 5, width - 10, height - 10)
    .fill(PALETTE.panel)
    .rect(x + 10, y + 10, width - 20, height - 20)
    .fill({ color: PALETTE.parchment, alpha: 0.22 })
}

function drawBackdropPattern(graphics: Graphics): void {
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
}

function drawNightOverlay(graphics: Graphics, dayProgress: number): void {
  const nightAlpha = dayProgress < 0.35 ? 0.24 : 0
  graphics.clear()
  if (nightAlpha > 0) {
    graphics.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x162646, alpha: nightAlpha })
  }
}

function drawTerrainTile(layer: Container, tile: Tile): void {
  const center = tileToScreen(tile)
  // Chunky rectangles keep every sprite aligned to the pixel-art grid.
  const color = tile.terrain === 'water' ? PALETTE.water : tile.terrain === 'forest' ? PALETTE.forest : (tile.column + tile.row) % 2 === 0 ? PALETTE.grass : PALETTE.grassLight
  const tileGraphic = new Graphics()
    .rect(center.x - TILE_SIZE / 2, center.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE)
    .fill(color)
    .rect(center.x - TILE_SIZE / 2, center.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE)
    .stroke({ color: PALETTE.deepInk, alpha: 0.15, width: 2 })

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

function screenToTile(position: Vector): Pick<Tile, 'column' | 'row'> | undefined {
  if (position.y >= GAME_HEIGHT - 152) return undefined

  const column = Math.floor((position.x - WORLD_OFFSET_X) / TILE_SIZE)
  const row = Math.floor((position.y - WORLD_OFFSET_Y) / TILE_SIZE)
  if (column <= 0 || row <= 0 || column >= WORLD_COLUMNS - 1 || row >= WORLD_ROWS - 1) {
    return undefined
  }
  return { column, row }
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

function canAfford(resources: ResourceStock, cost: ResourceStock): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone && resources.food >= cost.food && resources.gold >= cost.gold
}

function branchLabel(kind: UpgradeKind, branchKind: string): string {
  return UPGRADES[kind].branches.find((branch) => branch.kind === branchKind)?.label ?? 'chosen'
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

function destroyChildren(container: Container): void {
  for (const child of container.removeChildren()) {
    child.destroy({ children: true })
  }
}

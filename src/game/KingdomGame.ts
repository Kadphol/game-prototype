import { Application } from 'pixi.js'
import { GAME_HEIGHT, GAME_WIDTH, RENDER_FPS } from './config'
import { InputController } from './input'
import { KingdomRenderer, type RendererObjectCounts, type RendererPerformanceStats } from './rendering'
import { TouchCommandBar } from './touchControls'
import type { GamePhase, GameSnapshot, RendererCommand } from './types'
import { KingdomWorld } from './world'

declare global {
  interface Window {
    __cozyKingdomDebug?: {
      snapshot: () => GameSnapshot
      phase: () => GamePhase
      debugStats: () => RendererPerformanceStats & { debugVisible: boolean; objects?: RendererObjectCounts }
    }
  }
}

export class KingdomGame {
  private readonly input = new InputController(window)
  private readonly world = new KingdomWorld()
  private phase: GamePhase = 'start'
  private app?: Application
  private renderer?: KingdomRenderer
  private touchControls?: TouchCommandBar
  private shell?: HTMLDivElement
  private renderAccumulator = 1 / RENDER_FPS
  private debugVisible = false
  private fps = 0
  private frameMs = 0
  private lastCommandSource = 'none'

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const app = new Application()
    await app.init({
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: 0x14221b,
      antialias: false,
      resolution: 1,
      autoDensity: false,
    })

    app.canvas.tabIndex = 0
    app.canvas.setAttribute('aria-label', 'Cozy Kingdom playable PixiJS prototype')
    const shell = document.createElement('div')
    shell.className = 'game-shell'
    shell.appendChild(app.canvas)
    this.root.appendChild(shell)

    this.app = app
    this.shell = shell
    this.renderer = new KingdomRenderer(app)
    this.touchControls = new TouchCommandBar(shell)
    app.stage.addChild(this.renderer.stage)

    this.input.attach()
    app.ticker.add(this.tick)
    this.renderer.renderStart()

    if (import.meta.env.DEV) {
      window.__cozyKingdomDebug = {
        snapshot: () => this.world.snapshot(),
        phase: () => this.phase,
        debugStats: () => ({ ...this.performanceStats(), debugVisible: this.debugVisible, objects: this.renderer?.objectCounts() }),
      }
    }
  }

  destroy(): void {
    this.input.detach()
    if (import.meta.env.DEV) {
      delete window.__cozyKingdomDebug
    }
    this.app?.ticker.remove(this.tick)
    this.touchControls?.destroy()
    this.renderer?.destroy()
    this.app?.destroy(true)
    this.shell?.remove()
  }

  private readonly tick = (): void => {
    if (!this.app || !this.renderer) return

    const deltaSeconds = Math.min(this.app.ticker.deltaMS / 1000, 0.05)
    this.updatePerformance(deltaSeconds)
    const shouldRender = this.shouldRender(deltaSeconds)
    const pointerCommand = this.renderer.consumePointerCommand()
    const touchCommand = this.touchControls?.consumeCommand() ?? {}

    if (this.input.consumeAction('debug') || pointerCommand.debugToggle || touchCommand.debugToggle) {
      this.debugVisible = !this.debugVisible
      this.lastCommandSource = pointerCommand.debugToggle ? pointerCommand.source ?? 'canvas-debug' : touchCommand.debugToggle ? touchCommand.source ?? 'touch-debug' : 'keyboard-debug'
    }

    if (this.phase === 'start') {
      if (this.input.consumeAction('start') || pointerCommand.start || touchCommand.start) {
        this.phase = 'playing'
        this.world.reset()
        this.renderAccumulator = 1 / RENDER_FPS
        this.lastCommandSource = pointerCommand.start ? pointerCommand.source ?? 'canvas-start' : touchCommand.start ? touchCommand.source ?? 'touch-start' : 'keyboard-start'
      }
      if (shouldRender) {
        this.renderer.renderStart()
      }
      this.touchControls?.update(this.phase, undefined, this.debugVisible)
      this.input.endFrame()
      return
    }

    if (this.phase === 'gameOver') {
      let snapshot = this.world.snapshot()
      if (this.input.consumeAction('restart') || pointerCommand.restart || touchCommand.restart) {
        this.phase = 'playing'
        this.world.reset()
        snapshot = this.world.snapshot()
        this.renderAccumulator = 1 / RENDER_FPS
        this.lastCommandSource = pointerCommand.restart ? pointerCommand.source ?? 'canvas-restart' : touchCommand.restart ? touchCommand.source ?? 'touch-restart' : 'keyboard-restart'
      }
      if (shouldRender) {
        this.renderer.renderGame(snapshot, this.debugVisible, this.performanceStats())
      }
      this.touchControls?.update(this.phase, snapshot, this.debugVisible)
      this.input.endFrame()
      return
    }

    const selectedBuilding = this.input.consumeBuildingSelection()
    const selectedPriority = this.input.consumePrioritySelection()
    const priorityCycle = this.input.consumePriorityCycle()
    const upgradePurchase = this.input.consumeUpgradePurchase()
    const place = this.input.consumeAction('place')
    const mergedCommand = mergeCommands(pointerCommand, touchCommand)
    this.lastCommandSource = commandSource(mergedCommand, {
      selectedBuilding,
      selectedPriority,
      priorityCycle,
      upgradePurchase,
      place,
    }, this.lastCommandSource)

    this.world.update(deltaSeconds, {
      cursorDelta: this.input.consumeCursorDelta(),
      cursorTile: mergedCommand.cursorTile,
      place: place || Boolean(mergedCommand.place),
      selectedBuilding: mergedCommand.selectedBuilding ?? selectedBuilding,
      selectedPriority: mergedCommand.selectedPriority ?? selectedPriority,
      priorityCycle: priorityCycle + (mergedCommand.priorityCycle ?? 0),
      upgradePurchase: mergedCommand.upgradePurchase ?? upgradePurchase,
    })

    const snapshot = this.world.snapshot()
    if (snapshot.phase === 'gameOver') {
      this.phase = 'gameOver'
    }
    if (shouldRender || snapshot.phase === 'gameOver') {
      this.renderer.renderGame(snapshot, this.debugVisible, this.performanceStats())
    }
    this.touchControls?.update(this.phase, snapshot, this.debugVisible)
    this.input.endFrame()
  }

  private shouldRender(deltaSeconds: number): boolean {
    this.renderAccumulator += deltaSeconds
    if (this.renderAccumulator < 1 / RENDER_FPS) {
      return false
    }
    this.renderAccumulator = 0
    return true
  }

  private updatePerformance(deltaSeconds: number): void {
    const instantaneousFps = deltaSeconds > 0 ? 1 / deltaSeconds : 0
    this.fps = this.fps === 0 ? instantaneousFps : this.fps * 0.9 + instantaneousFps * 0.1
    this.frameMs = this.frameMs === 0 ? deltaSeconds * 1000 : this.frameMs * 0.9 + deltaSeconds * 1000 * 0.1
  }

  private performanceStats(): RendererPerformanceStats {
    return {
      fps: this.fps,
      frameMs: this.frameMs,
      commandSource: this.lastCommandSource,
    }
  }
}

function mergeCommands(first: RendererCommand, second: RendererCommand): RendererCommand {
  return {
    ...first,
    ...second,
    cursorTile: second.cursorTile ?? first.cursorTile,
    place: Boolean(first.place || second.place),
    start: Boolean(first.start || second.start),
    restart: Boolean(first.restart || second.restart),
    debugToggle: Boolean(first.debugToggle || second.debugToggle),
    priorityCycle: (first.priorityCycle ?? 0) + (second.priorityCycle ?? 0),
    source: second.source ?? first.source,
  }
}

function commandSource(
  command: RendererCommand,
  keyboard: Pick<RendererCommand, 'selectedBuilding' | 'selectedPriority' | 'priorityCycle' | 'upgradePurchase' | 'place'>,
  fallback: string
): string {
  if (command.source) return command.source
  if (keyboard.place) return 'keyboard-place'
  if (keyboard.selectedBuilding) return 'keyboard-build'
  if (keyboard.selectedPriority) return 'keyboard-priority'
  if ((keyboard.priorityCycle ?? 0) !== 0) return 'keyboard-priority-cycle'
  if (keyboard.upgradePurchase) return 'keyboard-upgrade'
  return fallback
}

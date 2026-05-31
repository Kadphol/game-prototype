import { Application } from 'pixi.js'
import { GAME_HEIGHT, GAME_WIDTH, RENDER_FPS } from './config'
import { InputController } from './input'
import { KingdomRenderer } from './rendering'
import type { GamePhase, GameSnapshot } from './types'
import { KingdomWorld } from './world'

declare global {
  interface Window {
    __cozyKingdomDebug?: {
      snapshot: () => GameSnapshot
      phase: () => GamePhase
    }
  }
}

export class KingdomGame {
  private readonly input = new InputController(window)
  private readonly world = new KingdomWorld()
  private phase: GamePhase = 'start'
  private app?: Application
  private renderer?: KingdomRenderer
  private renderAccumulator = 1 / RENDER_FPS

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
    this.root.appendChild(app.canvas)

    this.app = app
    this.renderer = new KingdomRenderer(app)
    app.stage.addChild(this.renderer.stage)

    this.input.attach()
    app.ticker.add(this.tick)
    this.renderer.renderStart()

    if (import.meta.env.DEV) {
      window.__cozyKingdomDebug = {
        snapshot: () => this.world.snapshot(),
        phase: () => this.phase,
      }
    }
  }

  destroy(): void {
    this.input.detach()
    if (import.meta.env.DEV) {
      delete window.__cozyKingdomDebug
    }
    this.app?.ticker.remove(this.tick)
    this.renderer?.destroy()
    this.app?.destroy(true)
  }

  private readonly tick = (): void => {
    if (!this.app || !this.renderer) return

    const deltaSeconds = Math.min(this.app.ticker.deltaMS / 1000, 0.05)
    const shouldRender = this.shouldRender(deltaSeconds)

    if (this.phase === 'start') {
      this.renderer.consumePointerCommand()
      if (this.input.consumeAction('start')) {
        this.phase = 'playing'
        this.world.reset()
        this.renderAccumulator = 1 / RENDER_FPS
      }
      if (shouldRender) {
        this.renderer.renderStart()
      }
      this.input.endFrame()
      return
    }

    if (this.phase === 'gameOver') {
      this.renderer.consumePointerCommand()
      if (this.input.consumeAction('restart')) {
        this.phase = 'playing'
        this.world.reset()
        this.renderAccumulator = 1 / RENDER_FPS
      }
      if (shouldRender) {
        this.renderer.renderGame(this.world.snapshot())
      }
      this.input.endFrame()
      return
    }

    const selectedBuilding = this.input.consumeBuildingSelection()
    const pointerCommand = this.renderer.consumePointerCommand()
    this.world.update(deltaSeconds, {
      cursorDelta: this.input.consumeCursorDelta(),
      cursorTile: pointerCommand.cursorTile,
      place: this.input.consumeAction('place') || pointerCommand.place,
      selectedBuilding,
      selectedPriority: this.input.consumePrioritySelection(),
      priorityCycle: this.input.consumePriorityCycle(),
      upgradePurchase: this.input.consumeUpgradePurchase(),
    })

    const snapshot = this.world.snapshot()
    if (snapshot.phase === 'gameOver') {
      this.phase = 'gameOver'
    }
    if (shouldRender || snapshot.phase === 'gameOver') {
      this.renderer.renderGame(snapshot)
    }
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
}

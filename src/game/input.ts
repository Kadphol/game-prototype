import type { BuildingKind, TaskPriority, UpgradePurchase, Vector } from './types'

type InputAction = 'place' | 'start' | 'restart' | 'debug'

export class InputController {
  private readonly pressed = new Set<string>()
  private readonly justPressed = new Set<string>()

  constructor(private readonly target: Window) {}

  attach(): void {
    this.target.addEventListener('keydown', this.handleKeyDown)
    this.target.addEventListener('keyup', this.handleKeyUp)
  }

  detach(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown)
    this.target.removeEventListener('keyup', this.handleKeyUp)
  }

  endFrame(): void {
    this.justPressed.clear()
  }

  consumeCursorDelta(): Vector {
    let x = 0
    let y = 0

    if (this.wasPressed('arrowleft') || this.wasPressed('a')) x -= 1
    if (this.wasPressed('arrowright') || this.wasPressed('d')) x += 1
    if (this.wasPressed('arrowup') || this.wasPressed('w')) y -= 1
    if (this.wasPressed('arrowdown') || this.wasPressed('s')) y += 1

    return { x, y }
  }

  consumeAction(action: InputAction): boolean {
    const keys = this.actionKeys(action)
    for (const key of keys) {
      if (this.justPressed.has(key)) {
        return true
      }
    }
    return false
  }

  consumeBuildingSelection(): BuildingKind | undefined {
    if (this.justPressed.has('1')) return 'hut'
    if (this.justPressed.has('2')) return 'farm'
    if (this.justPressed.has('3')) return 'tower'
    return undefined
  }

  consumeUpgradePurchase(): UpgradePurchase | undefined {
    if (this.justPressed.has('4')) return { kind: 'villagerSpeed' }
    if (this.justPressed.has('5')) return { kind: 'towerDamage' }
    if (this.justPressed.has('6')) return { kind: 'farmYield' }
    return undefined
  }

  consumePrioritySelection(): TaskPriority | undefined {
    if (this.justPressed.has('g')) return 'gather'
    if (this.justPressed.has('b')) return 'build'
    if (this.justPressed.has('f')) return 'defend'
    return undefined
  }

  consumePriorityCycle(): number {
    if (this.justPressed.has('q')) return -1
    if (this.justPressed.has('e')) return 1
    return 0
  }

  private wasPressed(key: string): boolean {
    return this.justPressed.has(key)
  }

  private actionKeys(action: InputAction): string[] {
    switch (action) {
      case 'place':
        return [' ', 'enter']
      case 'start':
        return ['enter']
      case 'restart':
        return ['r']
      case 'debug':
        return ['f1', '`']
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    if (!this.pressed.has(key)) {
      this.justPressed.add(key)
    }
    this.pressed.add(key)

    if (
      key === ' ' ||
      key === 'enter' ||
      key.startsWith('arrow') ||
      key === 'w' ||
      key === 'a' ||
      key === 's' ||
      key === 'd' ||
      key === 'q' ||
      key === 'e' ||
      key === 'g' ||
      key === 'b' ||
      key === 'f' ||
      key === '1' ||
      key === '2' ||
      key === '3' ||
      key === '4' ||
      key === '5' ||
      key === '6' ||
      key === 'f1' ||
      key === '`'
    ) {
      event.preventDefault()
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.key.toLowerCase())
  }
}

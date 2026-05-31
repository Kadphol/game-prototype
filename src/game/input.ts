import type { BuildingKind, Vector } from './types'

type InputAction = 'interact' | 'place' | 'start' | 'restart'

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

  movement(): Vector {
    const x = this.axis('arrowleft', 'a', 'arrowright', 'd')
    const y = this.axis('arrowup', 'w', 'arrowdown', 's')

    if (x === 0 && y === 0) {
      return { x: 0, y: 0 }
    }

    const length = Math.hypot(x, y)
    return { x: x / length, y: y / length }
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

  private axis(negativeArrow: string, negativeWasd: string, positiveArrow: string, positiveWasd: string): number {
    const negative = this.pressed.has(negativeArrow) || this.pressed.has(negativeWasd)
    const positive = this.pressed.has(positiveArrow) || this.pressed.has(positiveWasd)
    if (negative === positive) return 0
    return positive ? 1 : -1
  }

  private actionKeys(action: InputAction): string[] {
    switch (action) {
      case 'interact':
        return ['e']
      case 'place':
        return [' ', 'enter']
      case 'start':
        return ['enter']
      case 'restart':
        return ['r']
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
      key === 'd'
    ) {
      event.preventDefault()
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.key.toLowerCase())
  }
}

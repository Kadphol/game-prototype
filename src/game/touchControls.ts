import { BUILDING_ORDER, BUILDINGS, UPGRADES, UPGRADE_ORDER } from './config'
import type {
  BuildingKind,
  GamePhase,
  GameSnapshot,
  RendererCommand,
  ResourceKind,
  ResourceStock,
  TaskPriority,
  UpgradeBranchDefinition,
  UpgradeKind,
} from './types'

const PRIORITY_ORDER: TaskPriority[] = ['gather', 'build', 'defend']

export class TouchCommandBar {
  readonly element = document.createElement('div')
  private readonly phaseButton = this.makeButton('Start')
  private readonly buildButtons = new Map<BuildingKind, HTMLButtonElement>()
  private readonly priorityButtons = new Map<TaskPriority, HTMLButtonElement>()
  private readonly upgradeButtons = new Map<UpgradeKind, HTMLButtonElement>()
  private readonly branchButtons: HTMLButtonElement[] = []
  private readonly placeButton = this.makeButton('Place')
  private readonly debugButton = this.makeButton('DBG')
  private queuedCommand: RendererCommand = {}
  private selectedUpgrade: UpgradeKind = 'villagerSpeed'

  constructor(private readonly host: HTMLElement) {
    this.element.className = 'touch-command-bar'

    const flow = document.createElement('div')
    flow.className = 'touch-command-flow'
    this.element.appendChild(flow)

    this.phaseButton.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.queue({ start: true, restart: true, source: 'touch-phase' })
    })
    flow.appendChild(this.phaseButton)

    const buildGroup = this.makeGroup('Build')
    for (const kind of BUILDING_ORDER) {
      const definition = BUILDINGS[kind]
      const button = this.makeButton(definition.label)
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        this.queue({ selectedBuilding: kind, source: `touch-build-${kind}` })
      })
      this.buildButtons.set(kind, button)
      buildGroup.appendChild(button)
    }
    flow.appendChild(buildGroup)

    const priorityGroup = this.makeGroup('Priority')
    for (const priority of PRIORITY_ORDER) {
      const button = this.makeButton(priority)
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        this.queue({ selectedPriority: priority, source: `touch-priority-${priority}` })
      })
      this.priorityButtons.set(priority, button)
      priorityGroup.appendChild(button)
    }
    flow.appendChild(priorityGroup)

    const upgradeGroup = this.makeGroup('Upgrades')
    for (const kind of UPGRADE_ORDER) {
      const definition = UPGRADES[kind]
      const button = this.makeButton(definition.label)
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        this.selectedUpgrade = kind
        this.queue({ upgradePurchase: { kind }, source: `touch-upgrade-${kind}` })
      })
      this.upgradeButtons.set(kind, button)
      upgradeGroup.appendChild(button)
    }
    for (let index = 0; index < 2; index += 1) {
      const button = this.makeButton('Branch')
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        const branch = UPGRADES[this.selectedUpgrade].branches[index]
        if (branch) {
          this.queue({ upgradePurchase: { kind: this.selectedUpgrade, branch: branch.kind }, source: `touch-branch-${branch.kind}` })
        }
      })
      this.branchButtons.push(button)
      upgradeGroup.appendChild(button)
    }
    flow.appendChild(upgradeGroup)

    const actionGroup = this.makeGroup('Action')
    this.placeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.queue({ place: true, source: 'touch-place' })
    })
    this.debugButton.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.queue({ debugToggle: true, source: 'touch-debug' })
    })
    actionGroup.append(this.placeButton, this.debugButton)
    flow.appendChild(actionGroup)

    this.host.appendChild(this.element)
  }

  destroy(): void {
    this.element.remove()
  }

  consumeCommand(): RendererCommand {
    const command = { ...this.queuedCommand }
    this.queuedCommand = {}
    return command
  }

  update(phase: GamePhase, snapshot: GameSnapshot | undefined, debugVisible: boolean): void {
    const playing = phase === 'playing'
    this.element.dataset.phase = phase
    this.phaseButton.hidden = playing
    this.phaseButton.textContent = phase === 'gameOver' ? 'Restart' : 'Start'
    this.placeButton.disabled = !playing
    this.debugButton.textContent = debugVisible ? 'DBG on' : 'DBG'
    this.debugButton.classList.toggle('selected', debugVisible)

    if (!snapshot) return

    this.selectedUpgrade = snapshot.selectedUpgrade
    for (const kind of BUILDING_ORDER) {
      const definition = BUILDINGS[kind]
      const button = this.buildButtons.get(kind)
      if (!button) continue
      button.textContent = `${definition.label} ${compactCost(definition.cost)}`
      setButtonState(button, snapshot.selectedBuilding === kind, !canAfford(snapshot.resources, definition.cost), false)
    }

    for (const priority of PRIORITY_ORDER) {
      const button = this.priorityButtons.get(priority)
      if (button) {
        button.textContent = `${priority} ${snapshot.jobCounts[priority]}`
        setButtonState(button, snapshot.priority === priority, false, false)
      }
    }

    for (const kind of UPGRADE_ORDER) {
      const definition = UPGRADES[kind]
      const track = snapshot.upgrades[kind]
      const button = this.upgradeButtons.get(kind)
      if (!button) continue
      const unaffordable = !track.basePurchased && !canAfford(snapshot.resources, definition.baseCost)
      button.textContent = track.basePurchased ? `${definition.label} ${track.branch ? 'done' : 'branch'}` : `${definition.label} ${compactCost(definition.baseCost)}`
      setButtonState(button, snapshot.selectedUpgrade === kind, unaffordable, false)
    }

    UPGRADES[this.selectedUpgrade].branches.forEach((branch, index) => {
      this.updateBranchButton(this.branchButtons[index], snapshot, branch)
    })
  }

  private updateBranchButton(button: HTMLButtonElement | undefined, snapshot: GameSnapshot, branch: UpgradeBranchDefinition): void {
    if (!button) return

    const track = snapshot.upgrades[this.selectedUpgrade]
    const chosen = track.branch === branch.kind
    const locked = Boolean(track.branch && !chosen)
    const needsBase = !track.basePurchased
    button.textContent = `${branch.label} ${needsBase ? 'needs base' : chosen ? 'chosen' : compactCost(branch.cost)}`
    button.disabled = locked
    setButtonState(button, chosen, !needsBase && !canAfford(snapshot.resources, branch.cost), locked || needsBase)
  }

  private makeGroup(label: string): HTMLDivElement {
    const group = document.createElement('div')
    group.className = 'touch-command-group'
    group.setAttribute('aria-label', label)
    return group
  }

  private makeButton(label: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    return button
  }

  private queue(command: RendererCommand): void {
    this.queuedCommand = {
      ...this.queuedCommand,
      ...command,
      place: Boolean(this.queuedCommand.place || command.place),
      start: Boolean(this.queuedCommand.start || command.start),
      restart: Boolean(this.queuedCommand.restart || command.restart),
      priorityCycle: (this.queuedCommand.priorityCycle ?? 0) + (command.priorityCycle ?? 0),
      source: command.source ?? this.queuedCommand.source,
    }
  }
}

function setButtonState(button: HTMLButtonElement, selected: boolean, unaffordable: boolean, locked: boolean): void {
  button.classList.toggle('selected', selected)
  button.classList.toggle('unaffordable', unaffordable)
  button.classList.toggle('locked', locked)
}

function canAfford(resources: ResourceStock, cost: ResourceStock): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone && resources.food >= cost.food && resources.gold >= cost.gold
}

function compactCost(cost: ResourceStock): string {
  return (Object.entries(cost) as Array<[ResourceKind, number]>)
    .filter(([, value]) => value > 0)
    .map(([kind, value]) => `${kind[0].toUpperCase()}${value}`)
    .join(' ')
}

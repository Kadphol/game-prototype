import './styles.css'
import { KingdomGame } from './game/KingdomGame'

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('Missing #app root element')
}

const game = new KingdomGame(appElement)
void game.start()

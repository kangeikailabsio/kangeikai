import type { RoomConnection } from '$lib/network/room-connection'
import type { PoolAim, PoolCommand, PoolSnapshot } from '@kangeikai/game-pool/protocol'

const TAMPER_NOTICE_MS = 8000

/** Shared overlay lifecycle; the office only needs `open` to suppress its own input. */
export class GameSessionState {
  tableId: string | null = $state(null)
  snapshot: PoolSnapshot | null = $state(null)
  /** What the player on turn is aiming, only ever received as a spectator or as that player's teammate. */
  aim: PoolAim | null = $state(null)
  error = $state('')
  /** Who the table was told is running a modified client; shown briefly, then cleared. */
  tamperedBy = $state('')
  connected = $state(false)
  closing = $state(false)
  sessionId = $state('')
  receivedAt = $state(0)
  private connection: RoomConnection | null = null
  private tamperTimer: ReturnType<typeof setTimeout> | undefined

  get open(): boolean { return this.tableId !== null }

  connect(connection: RoomConnection): () => void {
    this.reset()
    this.connection = connection
    const removeEvents = connection.onPoolEvent((event) => {
      if (event.kind === 'snapshot' && event.state.tableId === this.tableId) {
        if (this.snapshot && event.state.revision < this.snapshot.revision)
          return
        this.snapshot = event.state
        this.receivedAt = Date.now()
        this.error = ''
      }
      else if (event.kind === 'aim' && event.tableId === this.tableId) {
        this.aim = event.aim
      }
      else if (event.kind === 'tamper' && event.tableId === this.tableId) {
        this.tamperedBy = event.name
        clearTimeout(this.tamperTimer)
        this.tamperTimer = setTimeout(() => {
          this.tamperedBy = ''
        }, TAMPER_NOTICE_MS)
      }
      else if (event.kind === 'closed' && event.tableId === this.tableId) {
        this.reset()
      }
      else if (event.kind === 'error') {
        this.error = event.message
        if (!this.snapshot) {
          this.tableId = null
          this.closing = false
        }
      }
    })
    const removeStatus = connection.onConnectionStateChange((status) => {
      this.connected = status === 'connected'
      this.sessionId = connection.sessionId ?? ''
      if (status === 'disconnected')
        this.reset()
      else if (status === 'connected' && this.tableId)
        connection.sendPool({ kind: this.closing ? 'leave' : 'open', tableId: this.tableId })
    })
    return () => {
      removeEvents()
      removeStatus()
      this.connection = null
      this.connected = false
      this.reset()
    }
  }

  openTable(tableId: string): void {
    if (this.open || !this.connected)
      return
    this.tableId = tableId
    this.snapshot = null
    this.aim = null
    this.error = ''
    this.closing = false
    this.connection?.flushPendingState()
    this.connection?.sendPool({ kind: 'open', tableId })
  }

  send(command: PoolCommand): void {
    if (this.connected && !this.closing) {
      this.error = ''
      this.connection?.sendPool(command)
    }
  }

  /** Aim updates are frequent and best-effort, so they neither clear the error banner nor are queued. */
  sendAim(command: PoolCommand): void {
    if (this.connected && !this.closing)
      this.connection?.sendPool(command)
  }

  close(): void {
    if (!this.tableId)
      return
    this.closing = true
    if (this.connected)
      this.connection?.sendPool({ kind: 'leave', tableId: this.tableId })
  }

  private reset(): void {
    clearTimeout(this.tamperTimer)
    this.tamperedBy = ''
    this.tableId = null
    this.snapshot = null
    this.aim = null
    this.closing = false
  }
}

export const gameSessionState = new GameSessionState()

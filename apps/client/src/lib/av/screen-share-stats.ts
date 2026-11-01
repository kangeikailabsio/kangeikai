/**
 * Pure logic behind the screen-share connection badge (#208): turns raw WebRTC `getStats()`
 * reports into readable numbers, a Good/Unstable/Poor level and a one-line probable cause.
 * Nothing here touches LiveKit or the DOM, so it is all unit-tested with fixtures.
 */

export type ShareRole = 'sender' | 'receiver'
export type ShareLevel = 'checking' | 'good' | 'unstable' | 'poor'
export type ShareTransport = 'UDP' | 'TCP'

/**
 * Fixed, conservative thresholds (#208) — to be tuned later with real data.
 * Loss is a percentage, RTT is in milliseconds, `FREEZE_HOLD_MS` is how long a freeze keeps
 * counting as "recent" so the level doesn't flicker back to good on the very next sample.
 */
export const SHARE_THRESHOLDS = {
  poorLossPercent: 5,
  unstableLossPercent: 1,
  unstableRttMs: 250,
  freezeHoldMs: 10_000,
} as const

/** One snapshot of the counters we care about, read from a single `getStats()` report. */
export interface RawSample {
  role: ShareRole
  /** `RTCStats.timestamp` in ms. */
  timestamp: number
  bytes: number
  /** Cumulative packets lost (receiver only). */
  packetsLost?: number
  /** Cumulative packets received (receiver only). */
  packetsReceived?: number
  /** Instantaneous loss reported back by the viewer, 0..1 (sender only). */
  fractionLost?: number
  framesPerSecond?: number
  frameWidth?: number
  frameHeight?: number
  jitterMs?: number
  framesDropped?: number
  /** Cumulative freeze count (receiver only). */
  freezeCount?: number
  roundTripTimeMs?: number
  /** `qualityLimitationReason` — 'none' | 'bandwidth' | 'cpu' | 'other' (sender only). */
  limitationReason?: string
  availableOutgoingBitrate?: number
  transport?: ShareTransport
}

export interface ShareStats {
  role: ShareRole
  level: ShareLevel
  /** Short label for the badge/popover headline, e.g. "Receiving well". */
  summary: string
  /** Probable cause, only set when the level is not good. */
  cause?: string
  bitrateKbps?: number
  fps?: number
  width?: number
  height?: number
  lossPercent?: number
  rttMs?: number
  jitterMs?: number
  framesDropped?: number
  freezeCount?: number
  limitationReason?: string
  availableOutgoingKbps?: number
  transport?: ShareTransport
}

type Stat = Record<string, unknown> & { type: string }

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function seconds(value: unknown): number | undefined {
  const parsed = num(value)
  return parsed === undefined ? undefined : parsed * 1000
}

function collect(report: { forEach: (callback: (stat: Stat) => void) => void }): Stat[] {
  const stats: Stat[] = []
  report.forEach(stat => stats.push(stat))
  return stats
}

/**
 * Finds whether the active ICE pair runs over UDP or TCP, plus its RTT and available outgoing
 * bitrate. Prefers the pair the `transport` stat points to, falling back to a nominated
 * succeeded pair for browsers that don't expose `selectedCandidatePairId`.
 */
function readSelectedPair(stats: Stat[]): Pick<RawSample, 'transport' | 'roundTripTimeMs' | 'availableOutgoingBitrate'> {
  const byId = new Map(stats.map(stat => [stat.id as string, stat]))
  const selectedId = stats.find(stat => stat.type === 'transport')?.selectedCandidatePairId as string | undefined
  const pair = (selectedId ? byId.get(selectedId) : undefined)
    ?? stats.find(stat => stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated === true)
  if (!pair) {
    return {}
  }
  const local = byId.get(pair.localCandidateId as string)
  const protocol = typeof local?.protocol === 'string' ? local.protocol.toLowerCase() : undefined
  return {
    transport: protocol === 'tcp' ? 'TCP' : protocol === 'udp' ? 'UDP' : undefined,
    roundTripTimeMs: seconds(pair.currentRoundTripTime),
    availableOutgoingBitrate: num(pair.availableOutgoingBitrate),
  }
}

/** Reads the viewer side: `inbound-rtp` video plus the selected candidate pair. */
export function parseReceiverReport(report: { forEach: (callback: (stat: Stat) => void) => void }, timestamp: number): RawSample | undefined {
  const stats = collect(report)
  const inbound = stats.find(stat => stat.type === 'inbound-rtp' && (stat.kind ?? stat.mediaType) === 'video')
  if (!inbound) {
    return undefined
  }
  const pair = readSelectedPair(stats)
  return {
    role: 'receiver',
    timestamp: num(inbound.timestamp) ?? timestamp,
    bytes: num(inbound.bytesReceived) ?? 0,
    packetsLost: num(inbound.packetsLost),
    packetsReceived: num(inbound.packetsReceived),
    framesPerSecond: num(inbound.framesPerSecond),
    frameWidth: num(inbound.frameWidth),
    frameHeight: num(inbound.frameHeight),
    jitterMs: seconds(inbound.jitter),
    framesDropped: num(inbound.framesDropped),
    freezeCount: num(inbound.freezeCount),
    roundTripTimeMs: pair.roundTripTimeMs,
    transport: pair.transport,
  }
}

/**
 * Reads the sharer side. Screen shares can be simulcast, so there may be several `outbound-rtp`
 * entries — the one with the biggest frame width is the layer viewers actually care about.
 */
export function parseSenderReport(report: { forEach: (callback: (stat: Stat) => void) => void }, timestamp: number): RawSample | undefined {
  const stats = collect(report)
  const outbound = stats
    .filter(stat => stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'video')
    .sort((a, b) => (num(b.frameWidth) ?? 0) - (num(a.frameWidth) ?? 0))[0]
  if (!outbound) {
    return undefined
  }
  const remote = stats.find(stat => stat.type === 'remote-inbound-rtp' && stat.ssrc === outbound.ssrc)
  const pair = readSelectedPair(stats)
  return {
    role: 'sender',
    timestamp: num(outbound.timestamp) ?? timestamp,
    bytes: num(outbound.bytesSent) ?? 0,
    fractionLost: num(remote?.fractionLost),
    framesPerSecond: num(outbound.framesPerSecond),
    frameWidth: num(outbound.frameWidth),
    frameHeight: num(outbound.frameHeight),
    roundTripTimeMs: seconds(remote?.roundTripTime) ?? pair.roundTripTimeMs,
    limitationReason: typeof outbound.qualityLimitationReason === 'string' ? outbound.qualityLimitationReason : undefined,
    availableOutgoingBitrate: pair.availableOutgoingBitrate,
    transport: pair.transport,
  }
}

function lossPercent(previous: RawSample, current: RawSample): number | undefined {
  if (current.role === 'sender') {
    return current.fractionLost === undefined ? undefined : current.fractionLost * 100
  }
  if (current.packetsLost === undefined || current.packetsReceived === undefined
    || previous.packetsLost === undefined || previous.packetsReceived === undefined) {
    return undefined
  }
  const lost = Math.max(0, current.packetsLost - previous.packetsLost)
  const received = Math.max(0, current.packetsReceived - previous.packetsReceived)
  const total = lost + received
  return total === 0 ? 0 : (lost / total) * 100
}

function hasActiveLimitation(reason: string | undefined): reason is string {
  return reason !== undefined && reason !== 'none'
}

interface Verdict {
  level: Exclude<ShareLevel, 'checking'>
  cause?: string
}

/** Applies the thresholds. `recentFreeze` already includes the hold window. */
export function classify(input: {
  role: ShareRole
  lossPercent?: number
  rttMs?: number
  limitationReason?: string
  recentFreeze: boolean
  transport?: ShareTransport
}): Verdict {
  const { role, lossPercent: loss = 0, rttMs, limitationReason, recentFreeze, transport } = input
  const poor = loss > SHARE_THRESHOLDS.poorLossPercent || recentFreeze
  const unstable = loss >= SHARE_THRESHOLDS.unstableLossPercent
    || (rttMs ?? 0) > SHARE_THRESHOLDS.unstableRttMs
    || hasActiveLimitation(limitationReason)
  if (!poor && !unstable) {
    return { level: 'good' }
  }

  const level = poor ? 'poor' : 'unstable'
  if (limitationReason === 'bandwidth') {
    return { level, cause: 'Limited by upload bandwidth' }
  }
  if (limitationReason === 'cpu') {
    return { level, cause: 'Limited by the sharer\'s CPU' }
  }
  if (transport === 'TCP') {
    return { level, cause: 'Using TCP fallback (UDP is blocked)' }
  }
  if (loss >= SHARE_THRESHOLDS.unstableLossPercent) {
    return { level, cause: role === 'sender' ? 'Packet loss while sending' : 'Packet loss while receiving' }
  }
  if (recentFreeze) {
    return { level, cause: 'The stream is freezing' }
  }
  if ((rttMs ?? 0) > SHARE_THRESHOLDS.unstableRttMs) {
    return { level, cause: 'High latency to the server' }
  }
  return { level, cause: 'Quality limited by the encoder' }
}

function summaryFor(role: ShareRole, level: ShareLevel): string {
  if (level === 'checking') {
    return 'Checking connection…'
  }
  if (level === 'good') {
    return role === 'sender' ? 'Sending well' : 'Receiving well'
  }
  return level === 'unstable' ? 'Unstable' : 'Poor'
}

/**
 * Remembers the previous sample (for bitrate/loss deltas) and the last freeze (for the hold
 * window) of one tile. One tracker per `sessionId`, discarded when the track changes.
 */
export function createStatsTracker() {
  let previous: RawSample | undefined
  let lastFreezeAt: number | undefined

  return {
    push(sample: RawSample): ShareStats {
      const before = previous
      previous = sample
      const base = {
        role: sample.role,
        fps: sample.framesPerSecond,
        width: sample.frameWidth,
        height: sample.frameHeight,
        rttMs: sample.roundTripTimeMs,
        jitterMs: sample.jitterMs,
        framesDropped: sample.framesDropped,
        freezeCount: sample.freezeCount,
        limitationReason: sample.limitationReason,
        availableOutgoingKbps: sample.availableOutgoingBitrate === undefined ? undefined : sample.availableOutgoingBitrate / 1000,
        transport: sample.transport,
      }

      if (!before || sample.timestamp <= before.timestamp) {
        return { ...base, level: 'checking', summary: summaryFor(sample.role, 'checking') }
      }

      if ((sample.freezeCount ?? 0) > (before.freezeCount ?? 0)) {
        lastFreezeAt = sample.timestamp
      }
      const recentFreeze = lastFreezeAt !== undefined && sample.timestamp - lastFreezeAt <= SHARE_THRESHOLDS.freezeHoldMs
      const loss = lossPercent(before, sample)
      const verdict = classify({
        role: sample.role,
        lossPercent: loss,
        rttMs: sample.roundTripTimeMs,
        limitationReason: sample.limitationReason,
        recentFreeze,
        transport: sample.transport,
      })

      return {
        ...base,
        level: verdict.level,
        summary: summaryFor(sample.role, verdict.level),
        cause: verdict.cause,
        bitrateKbps: Math.max(0, (8 * (sample.bytes - before.bytes)) / (sample.timestamp - before.timestamp)),
        lossPercent: loss,
      }
    },
  }
}

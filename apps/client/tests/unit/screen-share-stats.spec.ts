import type { RawSample } from '$lib/av/screen-share-stats'
import { classify, createStatsTracker, parseReceiverReport, parseSenderReport, SHARE_THRESHOLDS } from '$lib/av/screen-share-stats'
import { describe, expect, it } from 'vitest'

type Stat = Record<string, unknown> & { type: string }

function report(...stats: Stat[]) {
  return new Map(stats.map((stat, index) => [String(stat.id ?? index), { id: String(stat.id ?? index), ...stat }]))
}

const udpPair = [
  { type: 'transport', id: 'T', selectedCandidatePairId: 'P' },
  { type: 'candidate-pair', id: 'P', localCandidateId: 'L', currentRoundTripTime: 0.04, availableOutgoingBitrate: 4_000_000 },
  { type: 'local-candidate', id: 'L', protocol: 'udp' },
] as Stat[]

function receiver(over: Partial<RawSample> = {}): RawSample {
  return { role: 'receiver', timestamp: 0, bytes: 0, packetsLost: 0, packetsReceived: 0, ...over }
}

function sender(over: Partial<RawSample> = {}): RawSample {
  return { role: 'sender', timestamp: 0, bytes: 0, ...over }
}

describe('parseReceiverReport', () => {
  it('reads inbound-rtp video counters, converting seconds to ms', () => {
    const sample = parseReceiverReport(report(
      { type: 'inbound-rtp', kind: 'video', timestamp: 5000, bytesReceived: 1000, packetsLost: 2, packetsReceived: 98, framesPerSecond: 28, frameWidth: 1920, frameHeight: 1080, jitter: 0.005, framesDropped: 3, freezeCount: 1 },
      ...udpPair,
    ), 0)

    expect(sample).toMatchObject({
      role: 'receiver',
      timestamp: 5000,
      bytes: 1000,
      packetsLost: 2,
      packetsReceived: 98,
      framesPerSecond: 28,
      frameWidth: 1920,
      jitterMs: 5,
      framesDropped: 3,
      freezeCount: 1,
      roundTripTimeMs: 40,
      transport: 'UDP',
    })
  })

  it('ignores audio inbound-rtp and returns undefined without video', () => {
    expect(parseReceiverReport(report({ type: 'inbound-rtp', kind: 'audio' }), 0)).toBeUndefined()
  })

  it('detects the TCP fallback', () => {
    const sample = parseReceiverReport(report(
      { type: 'inbound-rtp', kind: 'video' },
      { type: 'transport', id: 'T', selectedCandidatePairId: 'P' },
      { type: 'candidate-pair', id: 'P', localCandidateId: 'L' },
      { type: 'local-candidate', id: 'L', protocol: 'tcp' },
    ), 0)

    expect(sample?.transport).toBe('TCP')
  })

  it('falls back to a nominated succeeded pair when the transport stat is missing', () => {
    const sample = parseReceiverReport(report(
      { type: 'inbound-rtp', kind: 'video' },
      { type: 'candidate-pair', id: 'P', localCandidateId: 'L', state: 'succeeded', nominated: true },
      { type: 'local-candidate', id: 'L', protocol: 'udp' },
    ), 0)

    expect(sample?.transport).toBe('UDP')
  })
})

describe('parseSenderReport', () => {
  it('picks the biggest simulcast layer and reads loss and RTT from remote-inbound-rtp', () => {
    const sample = parseSenderReport(report(
      { type: 'outbound-rtp', kind: 'video', ssrc: 1, frameWidth: 640, bytesSent: 10 },
      { type: 'outbound-rtp', kind: 'video', ssrc: 2, frameWidth: 1920, frameHeight: 1080, bytesSent: 500, framesPerSecond: 30, qualityLimitationReason: 'bandwidth' },
      { type: 'remote-inbound-rtp', ssrc: 2, fractionLost: 0.03, roundTripTime: 0.12 },
      ...udpPair,
    ), 0)

    expect(sample).toMatchObject({
      role: 'sender',
      bytes: 500,
      frameWidth: 1920,
      framesPerSecond: 30,
      fractionLost: 0.03,
      roundTripTimeMs: 120,
      limitationReason: 'bandwidth',
      availableOutgoingBitrate: 4_000_000,
      transport: 'UDP',
    })
  })

  it('returns undefined without outbound video', () => {
    expect(parseSenderReport(report({ type: 'outbound-rtp', kind: 'audio' }), 0)).toBeUndefined()
  })
})

describe('createStatsTracker', () => {
  it('reports "checking" on the first sample', () => {
    const stats = createStatsTracker().push(receiver())

    expect(stats.level).toBe('checking')
    expect(stats.bitrateKbps).toBeUndefined()
  })

  it('computes bitrate in kbps from the byte delta between samples', () => {
    const tracker = createStatsTracker()
    tracker.push(receiver({ timestamp: 1000, bytes: 0 }))
    // 250 000 bytes in 2 s = 1 000 kbps
    const stats = tracker.push(receiver({ timestamp: 3000, bytes: 250_000 }))

    expect(stats.bitrateKbps).toBeCloseTo(1000)
  })

  it('computes receiver loss from the packet delta, not the cumulative totals', () => {
    const tracker = createStatsTracker()
    tracker.push(receiver({ timestamp: 0, packetsLost: 500, packetsReceived: 500 }))
    const stats = tracker.push(receiver({ timestamp: 2000, packetsLost: 502, packetsReceived: 598 }))

    expect(stats.lossPercent).toBeCloseTo(2)
    expect(stats.level).toBe('unstable')
    expect(stats.cause).toBe('Packet loss while receiving')
  })

  it('uses fractionLost as the sender loss', () => {
    const tracker = createStatsTracker()
    tracker.push(sender({ timestamp: 0 }))
    const stats = tracker.push(sender({ timestamp: 2000, fractionLost: 0.08 }))

    expect(stats.lossPercent).toBeCloseTo(8)
    expect(stats.level).toBe('poor')
    expect(stats.cause).toBe('Packet loss while sending')
  })

  it('says "Sending well" / "Receiving well" when healthy', () => {
    const send = createStatsTracker()
    send.push(sender({ timestamp: 0 }))
    const recv = createStatsTracker()
    recv.push(receiver({ timestamp: 0 }))

    expect(send.push(sender({ timestamp: 2000, limitationReason: 'none' })).summary).toBe('Sending well')
    expect(recv.push(receiver({ timestamp: 2000 })).summary).toBe('Receiving well')
  })

  it('keeps a freeze "recent" for the hold window, then recovers', () => {
    const tracker = createStatsTracker()
    tracker.push(receiver({ timestamp: 0, freezeCount: 0 }))

    expect(tracker.push(receiver({ timestamp: 2000, freezeCount: 1 })).level).toBe('poor')
    expect(tracker.push(receiver({ timestamp: 4000, freezeCount: 1 })).level).toBe('poor')
    expect(tracker.push(receiver({ timestamp: 2000 + SHARE_THRESHOLDS.freezeHoldMs + 1, freezeCount: 1 })).level).toBe('good')
  })

  it('ignores samples whose timestamp did not advance', () => {
    const tracker = createStatsTracker()
    tracker.push(receiver({ timestamp: 1000 }))

    expect(tracker.push(receiver({ timestamp: 1000, bytes: 5 })).level).toBe('checking')
  })
})

describe('classify', () => {
  const healthy = { role: 'receiver', recentFreeze: false } as const

  it('is good with no loss, low RTT and no limitation', () => {
    expect(classify({ ...healthy, lossPercent: 0.5, rttMs: 100, limitationReason: 'none' }).level).toBe('good')
  })

  it('is unstable at 1% loss, RTT above 250 ms or an active limitation', () => {
    expect(classify({ ...healthy, lossPercent: 1 }).level).toBe('unstable')
    expect(classify({ ...healthy, rttMs: 251 }).level).toBe('unstable')
    expect(classify({ role: 'sender', recentFreeze: false, limitationReason: 'cpu' }).level).toBe('unstable')
  })

  it('is poor above 5% loss or on a recent freeze', () => {
    expect(classify({ ...healthy, lossPercent: 5 }).level).toBe('unstable')
    expect(classify({ ...healthy, lossPercent: 5.1 }).level).toBe('poor')
    expect(classify({ ...healthy, recentFreeze: true }).level).toBe('poor')
  })

  it('names the sharer limits first, then TCP, then loss', () => {
    const base = { role: 'sender', recentFreeze: false, lossPercent: 3, transport: 'TCP' } as const

    expect(classify({ ...base, limitationReason: 'bandwidth' }).cause).toBe('Limited by upload bandwidth')
    expect(classify({ ...base, limitationReason: 'cpu' }).cause).toBe('Limited by the sharer\'s CPU')
    expect(classify(base).cause).toBe('Using TCP fallback (UDP is blocked)')
    expect(classify({ ...base, transport: 'UDP' }).cause).toBe('Packet loss while sending')
  })

  it('explains a freeze or high latency when nothing else applies', () => {
    expect(classify({ ...healthy, recentFreeze: true }).cause).toBe('The stream is freezing')
    expect(classify({ ...healthy, rttMs: 400 }).cause).toBe('High latency to the server')
  })
})

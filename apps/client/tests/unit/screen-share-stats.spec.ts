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

describe('report parsing edge cases (issue #282)', () => {
  const inbound = { type: 'inbound-rtp', kind: 'video', timestamp: 1000, bytesReceived: 10 }

  it('reads the video entry by mediaType when the browser has no kind', () => {
    expect(parseReceiverReport(report({ type: 'inbound-rtp', mediaType: 'video', bytesReceived: 5 }), 7)).toMatchObject({ role: 'receiver', timestamp: 7, bytes: 5 })
    expect(parseReceiverReport(report({ type: 'inbound-rtp', mediaType: 'audio', bytesReceived: 5 }), 7)).toBeUndefined()
  })

  it('falls back to the caller\'s timestamp and to zero bytes when the entry has neither', () => {
    expect(parseReceiverReport(report({ type: 'inbound-rtp', kind: 'video' }), 42)).toMatchObject({ timestamp: 42, bytes: 0 })
  })

  it('names the transport from the selected pair\'s local candidate: TCP, UDP or unknown', () => {
    const withProtocol = (protocol: unknown) => parseReceiverReport(report(inbound, { type: 'transport', id: 'T', selectedCandidatePairId: 'P' }, { type: 'candidate-pair', id: 'P', localCandidateId: 'L' }, { type: 'local-candidate', id: 'L', protocol }), 0)

    expect(withProtocol('TCP')?.transport).toBe('TCP')
    expect(withProtocol('udp')?.transport).toBe('UDP')
    expect(withProtocol('tls')?.transport).toBeUndefined()
    expect(withProtocol(undefined)?.transport).toBeUndefined()
  })

  it('uses the nominated succeeded pair when the transport names none', () => {
    const sample = parseReceiverReport(report(
      inbound,
      { type: 'candidate-pair', id: 'P', state: 'succeeded', nominated: true, localCandidateId: 'L', currentRoundTripTime: 0.1 },
      { type: 'local-candidate', id: 'L', protocol: 'tcp' },
    ), 0)

    expect(sample).toMatchObject({ transport: 'TCP', roundTripTimeMs: 100 })
  })

  it('has no transport or round trip when no pair can be found', () => {
    const sample = parseReceiverReport(report(inbound, { type: 'transport', id: 'T', selectedCandidatePairId: 'missing' }, { type: 'candidate-pair', id: 'P', state: 'waiting' }), 0)

    expect(sample?.transport).toBeUndefined()
    expect(sample?.roundTripTimeMs).toBeUndefined()
  })

  it('reads the sharer side by mediaType and falls back to the caller\'s timestamp', () => {
    expect(parseSenderReport(report({ type: 'outbound-rtp', mediaType: 'video' }), 9)).toMatchObject({ role: 'sender', timestamp: 9, bytes: 0 })
    expect(parseSenderReport(report({ type: 'outbound-rtp', kind: 'audio' }), 9)).toBeUndefined()
    expect(parseSenderReport(report(), 9)).toBeUndefined()
  })

  it('picks the widest simulcast layer, also when some layers do not report a width', () => {
    const sample = parseSenderReport(report(
      { type: 'outbound-rtp', kind: 'video', id: 'a', bytesSent: 1 },
      { type: 'outbound-rtp', kind: 'video', id: 'b', frameWidth: 1920, bytesSent: 2 },
      { type: 'outbound-rtp', kind: 'video', id: 'c', frameWidth: 640, bytesSent: 3 },
    ), 0)

    expect(sample).toMatchObject({ bytes: 2, frameWidth: 1920 })
  })

  it('takes loss and round trip from the matching remote report, else from the pair', () => {
    const matched = parseSenderReport(report(
      { type: 'outbound-rtp', kind: 'video', ssrc: 1, qualityLimitationReason: 'cpu' },
      { type: 'remote-inbound-rtp', ssrc: 2, fractionLost: 0.9, roundTripTime: 0.5 },
      { type: 'remote-inbound-rtp', ssrc: 1, fractionLost: 0.05, roundTripTime: 0.03 },
      ...udpPair,
    ), 0)
    const unmatched = parseSenderReport(report({ type: 'outbound-rtp', kind: 'video', ssrc: 1, qualityLimitationReason: 7 }, ...udpPair), 0)

    expect(matched).toMatchObject({ fractionLost: 0.05, roundTripTimeMs: 30, limitationReason: 'cpu' })
    expect(unmatched).toMatchObject({ fractionLost: undefined, roundTripTimeMs: 40, limitationReason: undefined })
  })
})

describe('stats tracker and verdict edge cases (issue #282)', () => {
  it('reads the sharer\'s loss from the remote report, and has none while that report is missing', () => {
    const tracker = createStatsTracker()
    tracker.push(sender({ timestamp: 1000, bytes: 0 }))

    expect(tracker.push(sender({ timestamp: 2000, bytes: 125_000, fractionLost: 0.02 }))).toMatchObject({ lossPercent: 2, level: 'unstable', cause: 'Packet loss while sending' })
    expect(tracker.push(sender({ timestamp: 3000, bytes: 250_000 })).lossPercent).toBeUndefined()
  })

  it('has no loss to report while a counter of the viewer side is missing', () => {
    const tracker = createStatsTracker()
    tracker.push(receiver({ timestamp: 1000, packetsLost: undefined }))

    expect(tracker.push(receiver({ timestamp: 2000, packetsLost: 5, packetsReceived: 100 })).lossPercent).toBeUndefined()
    expect(tracker.push(receiver({ timestamp: 3000, packetsLost: 5, packetsReceived: undefined })).lossPercent).toBeUndefined()
  })

  it('reports the available outgoing bitrate in kbps', () => {
    const tracker = createStatsTracker()

    expect(tracker.push(sender({ timestamp: 1000, availableOutgoingBitrate: 4_000_000 })).availableOutgoingKbps).toBe(4000)
    expect(tracker.push(sender({ timestamp: 2000 })).availableOutgoingKbps).toBeUndefined()
  })

  it('blames latency when only the round trip is high, and the encoder when nothing else explains it', () => {
    expect(classify({ role: 'receiver', rttMs: SHARE_THRESHOLDS.unstableRttMs + 1, recentFreeze: false })).toEqual({ level: 'unstable', cause: 'High latency to the server' })
    expect(classify({ role: 'receiver', recentFreeze: true, rttMs: 10 })).toEqual({ level: 'poor', cause: 'The stream is freezing' })
    expect(classify({ role: 'receiver', limitationReason: 'other', recentFreeze: false })).toEqual({ level: 'unstable', cause: 'Quality limited by the encoder' })
    expect(classify({ role: 'receiver', limitationReason: 'none', rttMs: 10, recentFreeze: false })).toEqual({ level: 'good' })
  })
})

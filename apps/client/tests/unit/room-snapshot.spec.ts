import type { Room } from 'livekit-client'
import { snapshotRoom } from '$lib/av/room-snapshot'
import { Track } from 'livekit-client'
import { describe, expect, it } from 'vitest'

function fakeParticipant(fields: { identity?: string, name?: string, cam?: boolean, mic?: boolean, speaking?: boolean, camera?: object, screen?: object }) {
  return {
    identity: fields.identity ?? '',
    name: fields.name,
    isCameraEnabled: fields.cam ?? false,
    isMicrophoneEnabled: fields.mic ?? false,
    isSpeaking: fields.speaking ?? false,
    getTrackPublication: (source: Track.Source) => {
      const track = source === Track.Source.Camera ? fields.camera : source === Track.Source.ScreenShare ? fields.screen : undefined
      return track ? { track } : undefined
    },
  }
}

describe('snapshotRoom (issue #274)', () => {
  it('reads the local person and each remote one as plain data, tracks passed through', () => {
    const camera = { kind: 'camera' }
    const screen = { kind: 'screen' }
    const room = {
      localParticipant: fakeParticipant({ identity: 'me', name: 'Me', cam: true, mic: true, speaking: true, camera }),
      remoteParticipants: new Map([['ana', fakeParticipant({ name: 'Ana', mic: true, screen })]]),
    } as unknown as Room

    const snapshot = snapshotRoom(room)

    expect(snapshot.local).toEqual({ sessionId: 'me', name: 'Me', cameraEnabled: true, micEnabled: true, speaking: true, cameraTrack: camera, screenTrack: undefined })
    expect(snapshot.remotes.get('ana')).toEqual({ sessionId: 'ana', name: 'Ana', cameraEnabled: false, micEnabled: true, speaking: false, cameraTrack: undefined, screenTrack: screen })
  })

  it('falls back to "You" for an unnamed local person and to the session id for an unnamed remote one', () => {
    const room = {
      localParticipant: fakeParticipant({ identity: 'me' }),
      remoteParticipants: new Map([['ana', fakeParticipant({ name: '' })]]),
    } as unknown as Room

    const snapshot = snapshotRoom(room)

    expect(snapshot.local.name).toBe('You')
    expect(snapshot.remotes.get('ana')?.name).toBe('ana')
  })

  it('has no remotes for a room nobody else is in', () => {
    const room = { localParticipant: fakeParticipant({ identity: 'me' }), remoteParticipants: new Map() } as unknown as Room

    expect(snapshotRoom(room).remotes.size).toBe(0)
  })
})

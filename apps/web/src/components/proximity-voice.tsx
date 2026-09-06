"use client";

import {
  LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack,
  useLocalParticipant, useRoomContext, useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track, VideoPresets, VideoQuality } from "livekit-client";
import type { OfficeLayout } from "@/lib/office-layout";
import { useEffect } from "react";
import {
  audioRoomAt, canHear, isRoomWide, volumeFor,
  PROXIMITY_FULL_VOLUME_TILES, PROXIMITY_SILENT_TILES,
  type Point, type SeatState,
} from "@/lib/office-audio";

// Re-exported so callers keep importing "who can hear whom" from one place.
export { audioRoomAt, canHear, isRoomWide, volumeFor, PROXIMITY_FULL_VOLUME_TILES, PROXIMITY_SILENT_TILES };

type PeerInfo = Point & SeatState;

function ProximitySubscriptions({ layout, selfPosition, selfSeat, peers, visibleUserIds }: {
  layout: OfficeLayout;
  selfPosition: Point;
  selfSeat: SeatState;
  peers: Record<string, PeerInfo>;
  visibleUserIds: string[];
}) {
  const room = useRoomContext();
  useEffect(() => {
    const visible = new Set(visibleUserIds);
    const syncSubscriptions = () => {
      room.remoteParticipants.forEach((participant) => {
        const peer = peers[participant.identity];
        const volume = peer ? volumeFor(layout, selfPosition, peer, selfSeat, peer) : 0;
        const audible = volume > 0;
        participant.setVolume(volume);
        participant.trackPublications.forEach((publication) => {
          const shouldSubscribe = publication.source === Track.Source.Microphone
            ? audible
            : publication.source === Track.Source.Camera && visible.has(participant.identity);
          if (publication.isSubscribed !== shouldSubscribe) publication.setSubscribed(shouldSubscribe);
          if (shouldSubscribe && publication.source === Track.Source.Camera) {
            publication.setVideoQuality(VideoQuality.LOW);
          }
        });
      });
    };

    syncSubscriptions();
    room.on(RoomEvent.ParticipantConnected, syncSubscriptions);
    room.on(RoomEvent.TrackPublished, syncSubscriptions);
    room.on(RoomEvent.TrackUnpublished, syncSubscriptions);
    return () => {
      room.off(RoomEvent.ParticipantConnected, syncSubscriptions);
      room.off(RoomEvent.TrackPublished, syncSubscriptions);
      room.off(RoomEvent.TrackUnpublished, syncSubscriptions);
    };
  }, [room, layout, selfPosition, selfSeat, peers, visibleUserIds]);
  return null;
}

function MicSwitch({ enabled, onError }: { enabled: boolean; onError?: (message: string) => void }) {
  const room = useRoomContext();
  useEffect(() => {
    room.localParticipant.setMicrophoneEnabled(enabled).catch(() => {
      onError?.("Não foi possível ativar o microfone. Verifique as permissões do navegador.");
    });
  }, [room, enabled, onError]);
  return null;
}

function CameraSwitch({ enabled, onError }: { enabled: boolean; onError?: (message: string) => void }) {
  const { localParticipant } = useLocalParticipant();
  useEffect(() => {
    localParticipant.setCameraEnabled(enabled, {
      resolution: VideoPresets.h360.resolution,
    }).catch(() => {
      onError?.("Não foi possível ativar a câmera. Verifique as permissões do navegador.");
    });
  }, [localParticipant, enabled, onError]);
  return null;
}

export type NearbyPerson = { userId: string; name: string; photo?: string | null };
export type SelfPerson = { name: string; photo?: string | null };

/** Small video (or photo, or initial) tiles for whoever is currently close
 * enough to hear/be heard — the same `nearby` list already used for audio,
 * so "who's in the bubble" always matches what's shown on screen. Your own
 * tile leads the strip whenever the camera is actually publishing, which
 * doubles as the answer to "am I on camera right now?". */
function ProximityVideoTiles({ nearby, self }: { nearby: NearbyPerson[]; self: SelfPerson }) {
  const cameraTracks = useTracks([Track.Source.Camera]);
  if (!nearby.length) return null;
  const selfTrack = cameraTracks.find((track) => track.participant.isLocal);
  const tiles = [
    ...(selfTrack ? [{ userId: "self", name: self.name, photo: self.photo, isSelf: true }] : []),
    ...nearby.map((person) => ({ ...person, isSelf: false })),
  ];
  if (!tiles.length) return null;
  return (
    <div className="proximity-video-tiles">
      {tiles.map((person) => {
        const track = person.isSelf ? selfTrack : cameraTracks.find((t) => t.participant.identity === person.userId);
        return (
          <div className={`proximity-video-tile ${person.isSelf ? "is-self" : ""}`} key={person.userId}>
            {track ? (
              <VideoTrack trackRef={track} />
            ) : person.photo ? (
              <img src={person.photo} alt="" />
            ) : (
              <span className="proximity-video-initial">{person.name.slice(0, 1).toUpperCase()}</span>
            )}
            <label>{person.isSelf ? "Você" : person.name}</label>
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  token: string;
  serverUrl: string;
  layout: OfficeLayout;
  selfPosition: Point;
  selfSeat: SeatState;
  peers: Record<string, PeerInfo>;
  nearby: NearbyPerson[];
  self: SelfPerson;
  micOn: boolean;
  cameraOn: boolean;
  onError?: (message: string) => void;
};

/** Mounted only while somebody is close enough to talk. Remote tracks are
 * explicitly subscribed so hidden media does not keep consuming bandwidth. */
export function ProximityVoice({ token, serverUrl, layout, selfPosition, selfSeat, peers, nearby, self, micOn, cameraOn, onError }: Props) {
  const visibleUserIds = nearby.map((person) => person.userId);
  return (
    <LiveKitRoom
      className="proximity-room"
      token={token}
      serverUrl={serverUrl}
      connect
      audio={false}
      video={false}
      connectOptions={{ autoSubscribe: false }}
      options={{ adaptiveStream: true, dynacast: true }}
      onError={() => onError?.("Não foi possível conectar à voz por proximidade.")}
    >
      <ProximitySubscriptions
        layout={layout}
        selfPosition={selfPosition}
        selfSeat={selfSeat}
        peers={peers}
        visibleUserIds={visibleUserIds}
      />
      <MicSwitch enabled={micOn} onError={onError} />
      <CameraSwitch enabled={cameraOn} onError={onError} />
      <ProximityVideoTiles nearby={nearby} self={self} />
      <RoomAudioRenderer />
      <StartAudio label="Ativar áudio do escritório" className="proximity-start-audio" />
    </LiveKitRoom>
  );
}

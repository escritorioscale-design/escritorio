"use client";

import {
  LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack,
  useLocalParticipant, useRoomContext, useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect } from "react";
import { SEAT_LOCK_RADIUS } from "@/lib/office-layout";

/** Inside this many tiles, remote voices play at full volume. */
export const PROXIMITY_FULL_VOLUME_TILES = 3.5;
/** Beyond this many tiles, remote voices are inaudible. */
export const PROXIMITY_SILENT_TILES = 9;

type Point = { x: number; y: number };
type SeatState = { sitting?: boolean; seatLocked?: boolean };

function volumeForDistance(distance: number) {
  if (distance <= PROXIMITY_FULL_VOLUME_TILES) return 1;
  if (distance >= PROXIMITY_SILENT_TILES) return 0;
  return 1 - (distance - PROXIMITY_FULL_VOLUME_TILES) / (PROXIMITY_SILENT_TILES - PROXIMITY_FULL_VOLUME_TILES);
}

/** Plain proximity by default. Once either side locks their own seat, the
 * conversation shrinks to a tight, hard-edged bubble around that desk — full
 * volume just inside it, silent just past it — so a stranger walking by
 * (already kept out physically by the same lock, see office-builder.tsx)
 * can't listen in from the doorway either. */
export function volumeFor(
  layout: { mapCols: number; mapRows: number },
  selfPos: Point, peerPos: Point,
  selfSeat: SeatState, peerSeat: SeatState,
): number {
  const dx = ((selfPos.x - peerPos.x) / 100) * layout.mapCols;
  const dy = ((selfPos.y - peerPos.y) / 100) * layout.mapRows;
  const distance = Math.hypot(dx, dy);
  const anyLocked = (selfSeat.sitting && selfSeat.seatLocked) || (peerSeat.sitting && peerSeat.seatLocked);
  if (anyLocked) return distance <= SEAT_LOCK_RADIUS ? 1 : 0;
  return volumeForDistance(distance);
}

export function canHear(
  layout: { mapCols: number; mapRows: number },
  selfPos: Point, peerPos: Point,
  selfSeat: SeatState, peerSeat: SeatState,
): boolean {
  return volumeFor(layout, selfPos, peerPos, selfSeat, peerSeat) > 0;
}

type PeerInfo = Point & SeatState;

function ProximityMixer({ layout, selfPosition, selfSeat, peers }: {
  layout: { mapCols: number; mapRows: number };
  selfPosition: Point;
  selfSeat: SeatState;
  peers: Record<string, PeerInfo>;
}) {
  const room = useRoomContext();
  useEffect(() => {
    room.remoteParticipants.forEach((participant) => {
      const peer = peers[participant.identity];
      participant.setVolume(peer ? volumeFor(layout, selfPosition, peer, selfSeat, peer) : 0);
    });
  }, [room, layout, selfPosition, selfSeat, peers]);
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
    localParticipant.setCameraEnabled(enabled).catch(() => {
      onError?.("Não foi possível ativar a câmera. Verifique as permissões do navegador.");
    });
  }, [localParticipant, enabled, onError]);
  return null;
}

export type NearbyPerson = { userId: string; name: string; photo?: string | null };

/** Small video (or photo, or initial) tiles for whoever is currently close
 * enough to hear/be heard — the same `nearby` list already used for audio,
 * so "who's in the bubble" always matches what's shown on screen. */
function ProximityVideoTiles({ nearby }: { nearby: NearbyPerson[] }) {
  const cameraTracks = useTracks([Track.Source.Camera]);
  if (!nearby.length) return null;
  return (
    <div className="proximity-video-tiles">
      {nearby.map((person) => {
        const track = cameraTracks.find((t) => t.participant.identity === person.userId);
        return (
          <div className="proximity-video-tile" key={person.userId}>
            {track ? (
              <VideoTrack trackRef={track} />
            ) : person.photo ? (
              <img src={person.photo} alt="" />
            ) : (
              <span className="proximity-video-initial">{person.name.slice(0, 1).toUpperCase()}</span>
            )}
            <label>{person.name}</label>
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  token: string;
  serverUrl: string;
  layout: { mapCols: number; mapRows: number };
  selfPosition: Point;
  selfSeat: SeatState;
  peers: Record<string, PeerInfo>;
  nearby: NearbyPerson[];
  micOn: boolean;
  cameraOn: boolean;
  onError?: (message: string) => void;
};

/** Always-connected, audio-(and now video-)only room: hearing and seeing a
 * nearby coworker is just a matter of walking close enough, no explicit call
 * to join. */
export function ProximityVoice({ token, serverUrl, layout, selfPosition, selfSeat, peers, nearby, micOn, cameraOn, onError }: Props) {
  return (
    <LiveKitRoom
      className="proximity-room"
      token={token}
      serverUrl={serverUrl}
      connect
      audio={false}
      video={false}
      onError={() => onError?.("Não foi possível conectar à voz por proximidade.")}
    >
      <ProximityMixer layout={layout} selfPosition={selfPosition} selfSeat={selfSeat} peers={peers} />
      <MicSwitch enabled={micOn} onError={onError} />
      <CameraSwitch enabled={cameraOn} onError={onError} />
      <ProximityVideoTiles nearby={nearby} />
      <RoomAudioRenderer />
      <StartAudio label="Ativar áudio do escritório" className="proximity-start-audio" />
    </LiveKitRoom>
  );
}

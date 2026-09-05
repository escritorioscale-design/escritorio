"use client";

import { LiveKitRoom, RoomAudioRenderer, StartAudio, useRoomContext } from "@livekit/components-react";
import { useEffect } from "react";
import { roomAt, type OfficeLayout } from "@/lib/office-layout";

/** Inside this many tiles (in the open floor, outside any room), remote
 * voices play at full volume. */
export const PROXIMITY_FULL_VOLUME_TILES = 3.5;
/** Beyond this many tiles in the open floor, remote voices are inaudible. */
export const PROXIMITY_SILENT_TILES = 9;

type Point = { x: number; y: number };

function toTiles(layout: OfficeLayout, p: Point) {
  return { x: (p.x / 100) * layout.mapCols, y: (p.y / 100) * layout.mapRows };
}

function volumeForDistance(distance: number) {
  if (distance <= PROXIMITY_FULL_VOLUME_TILES) return 1;
  if (distance >= PROXIMITY_SILENT_TILES) return 0;
  return 1 - (distance - PROXIMITY_FULL_VOLUME_TILES) / (PROXIMITY_SILENT_TILES - PROXIMITY_FULL_VOLUME_TILES);
}

/** A room is its own audio bubble: whoever is inside hears everyone else
 * inside, at full volume, and nobody outside hears in — same as a real
 * meeting room's walls. Locking a room already keeps outsiders from
 * physically entering, so it doubles as blocking them from the
 * conversation too. Out in the open floor (no room), it's plain
 * distance-based falloff, same as before. */
export function canHear(layout: OfficeLayout, selfPos: Point, peerPos: Point): boolean {
  return volumeFor(layout, selfPos, peerPos) > 0;
}

export function volumeFor(layout: OfficeLayout, selfPos: Point, peerPos: Point): number {
  const self = toTiles(layout, selfPos);
  const peer = toTiles(layout, peerPos);
  const selfRoom = roomAt(layout, self.x, self.y);
  const peerRoom = roomAt(layout, peer.x, peer.y);
  if (selfRoom || peerRoom) return selfRoom?.id === peerRoom?.id ? 1 : 0;
  return volumeForDistance(Math.hypot(self.x - peer.x, self.y - peer.y));
}

function ProximityMixer({ layout, selfPosition, peers }: { layout: OfficeLayout; selfPosition: Point; peers: Record<string, Point> }) {
  const room = useRoomContext();
  useEffect(() => {
    room.remoteParticipants.forEach((participant) => {
      const peer = peers[participant.identity];
      participant.setVolume(peer ? volumeFor(layout, selfPosition, peer) : 0);
    });
  }, [room, layout, selfPosition, peers]);
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

type Props = {
  token: string;
  serverUrl: string;
  layout: OfficeLayout;
  selfPosition: Point;
  peers: Record<string, Point>;
  micOn: boolean;
  onError?: (message: string) => void;
};

/** Always-connected, audio-only room: hearing a nearby coworker is just a
 * matter of walking close enough (or into the same room), no explicit call
 * to join. */
export function ProximityVoice({ token, serverUrl, layout, selfPosition, peers, micOn, onError }: Props) {
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
      <ProximityMixer layout={layout} selfPosition={selfPosition} peers={peers} />
      <MicSwitch enabled={micOn} onError={onError} />
      <RoomAudioRenderer />
      <StartAudio label="Ativar áudio do escritório" className="proximity-start-audio" />
    </LiveKitRoom>
  );
}

"use client";

import { LiveKitRoom, RoomAudioRenderer, StartAudio, useRoomContext } from "@livekit/components-react";
import { useEffect } from "react";
import { MAP_COLS, MAP_ROWS } from "@/lib/office-map";

/** Inside this many tiles, remote voices play at full volume. */
export const PROXIMITY_FULL_VOLUME_TILES = 3.5;
/** Beyond this many tiles, remote voices are inaudible. */
export const PROXIMITY_SILENT_TILES = 9;

type Point = { x: number; y: number };

export function tileDistance(a: Point, b: Point) {
  const dx = ((a.x - b.x) / 100) * MAP_COLS;
  const dy = ((a.y - b.y) / 100) * MAP_ROWS;
  return Math.hypot(dx, dy);
}

export function volumeForDistance(distance: number) {
  if (distance <= PROXIMITY_FULL_VOLUME_TILES) return 1;
  if (distance >= PROXIMITY_SILENT_TILES) return 0;
  return 1 - (distance - PROXIMITY_FULL_VOLUME_TILES) / (PROXIMITY_SILENT_TILES - PROXIMITY_FULL_VOLUME_TILES);
}

function ProximityMixer({ selfPosition, peers }: { selfPosition: Point; peers: Record<string, Point> }) {
  const room = useRoomContext();
  useEffect(() => {
    room.remoteParticipants.forEach((participant) => {
      const peer = peers[participant.identity];
      participant.setVolume(peer ? volumeForDistance(tileDistance(selfPosition, peer)) : 0);
    });
  }, [room, selfPosition, peers]);
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
  selfPosition: Point;
  peers: Record<string, Point>;
  micOn: boolean;
  onError?: (message: string) => void;
};

/** Always-connected, audio-only room: hearing a nearby coworker is just a
 * matter of walking close enough, no explicit call to join. */
export function ProximityVoice({ token, serverUrl, selfPosition, peers, micOn, onError }: Props) {
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
      <ProximityMixer selfPosition={selfPosition} peers={peers} />
      <MicSwitch enabled={micOn} onError={onError} />
      <RoomAudioRenderer />
      <StartAudio label="Ativar áudio do escritório" className="proximity-start-audio" />
    </LiveKitRoom>
  );
}

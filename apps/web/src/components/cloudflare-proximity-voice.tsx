"use client";

import type { Socket } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OfficeLayout } from "@/lib/office-layout";
import { volumeFor, type Point, type SeatState } from "@/lib/office-audio";
import type { NearbyPerson, SelfPerson } from "@/components/proximity-voice";

type PeerInfo = Point & SeatState;
type MediaTrackKind = "audio" | "video";
type MediaCatalogEntry = {
  userId: string;
  name: string;
  sessionId: string;
  tracks: { trackName: string; kind: MediaTrackKind }[];
};
type TrackBinding = { userId: string; name: string; kind: MediaTrackKind; mid: string | null };
type RemoteMedia = Record<string, { name: string; audio?: MediaStreamTrack; video?: MediaStreamTrack }>;
type Ack<T> = { ok: true } & T | { ok: false; error: string };

const peerConnectionConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
  bundlePolicy: "max-bundle",
};

function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, response: Ack<T>) => error ? reject(error) : resolve(response);
    if (payload === undefined) socket.timeout(10_000).emit(event, callback);
    else socket.timeout(10_000).emit(event, payload, callback);
  });
}

function description(value: unknown): RTCSessionDescriptionInit {
  const candidate = value as { type?: RTCSdpType; sdp?: string } | null;
  if (!candidate?.type || !candidate.sdp) throw new Error("invalid_session_description");
  return { type: candidate.type, sdp: candidate.sdp };
}

function RemoteAudio({ track, volume }: { track: MediaStreamTrack; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = new MediaStream([track]);
    element.volume = Math.max(0, Math.min(1, volume));
    void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [track, volume]);
  return <audio ref={ref} autoPlay playsInline />;
}

function VideoMedia({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted={false} />;
}

type Props = {
  socket: Socket;
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

export function CloudflareProximityVoice({
  socket, layout, selfPosition, selfSeat, peers, nearby, self, micOn, cameraOn, onError,
}: Props) {
  const [catalog, setCatalog] = useState<MediaCatalogEntry[]>([]);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia>({});
  const [localVideo, setLocalVideo] = useState<MediaStreamTrack | null>(null);
  const [socketOnline, setSocketOnline] = useState(socket.connected);
  const [socketEpoch, setSocketEpoch] = useState(0);
  const audibleUserIds = useMemo(() => Object.entries(peers).flatMap(([userId, peer]) =>
    volumeFor(layout, selfPosition, peer, selfSeat, peer) > 0 ? [userId] : []),
  [layout, selfPosition, selfSeat, peers]);
  const videoUserIds = useMemo(() => nearby.map((person) => person.userId), [nearby]);
  const audibleKey = audibleUserIds.join(":");
  const videoKey = videoUserIds.join(":");

  useEffect(() => {
    const receiveCatalog = (next: MediaCatalogEntry[]) => setCatalog(next);
    const handleConnect = () => {
      setSocketOnline(true);
      setSocketEpoch((current) => current + 1);
      socket.emit("media:catalog:get");
    };
    const handleDisconnect = () => setSocketOnline(false);
    socket.on("media:catalog", receiveCatalog);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    if (socket.connected) socket.emit("media:catalog:get");
    return () => {
      socket.off("media:catalog", receiveCatalog);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    let cancelled = false;
    let connection: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;

    async function publish() {
      socket.emit("media:publisher:clear");
      setLocalVideo(null);
      if (!socketOnline) return;
      if (!micOn && !cameraOn) return;

      localStream = await navigator.mediaDevices.getUserMedia({
        audio: micOn,
        video: cameraOn ? {
          width: { ideal: 640, max: 640 },
          height: { ideal: 360, max: 360 },
          frameRate: { ideal: 15, max: 20 },
        } : false,
      });
      if (cancelled) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      setLocalVideo(localStream.getVideoTracks()[0] ?? null);
      const session = await emitAck<{ sessionId: string }>(socket, "media:publisher:create");
      if (!session.ok) throw new Error(session.error);
      if (cancelled) return;

      connection = new RTCPeerConnection(peerConnectionConfig);
      const transceivers = localStream.getTracks().map((track) => connection!.addTransceiver(track, {
        direction: "sendonly",
        ...(track.kind === "video" ? {
          sendEncodings: [{ maxBitrate: 350_000, maxFramerate: 20, scaleResolutionDownBy: 1 }],
        } : {}),
      }));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const published = await emitAck<{ result: { sessionDescription: unknown } }>(socket, "media:publisher:publish", {
        sessionDescription: { type: offer.type, sdp: offer.sdp },
        tracks: transceivers.map(({ mid, sender }) => ({
          mid,
          trackName: sender.track!.id,
          kind: sender.track!.kind,
        })),
      });
      if (!published.ok) throw new Error(published.error);
      if (cancelled) {
        socket.emit("media:publisher:clear");
        return;
      }
      await connection.setRemoteDescription(description(published.result.sessionDescription));
      onError?.("");
    }

    void publish().catch(() => {
      if (!cancelled) onError?.("Não foi possível publicar áudio ou vídeo pela Cloudflare.");
    });
    return () => {
      cancelled = true;
      socket.emit("media:publisher:clear");
      localStream?.getTracks().forEach((track) => track.stop());
      connection?.close();
      setLocalVideo(null);
    };
  }, [socket, socketOnline, socketEpoch, micOn, cameraOn, onError]);

  useEffect(() => {
    let cancelled = false;
    let connection: RTCPeerConnection | null = null;
    setRemoteMedia({});

    async function subscribe() {
      if (!socketOnline) return;
      const hasRequestedTracks = catalog.some((entry) => entry.tracks.some((track) =>
        track.kind === "audio" ? audibleUserIds.includes(entry.userId) : videoUserIds.includes(entry.userId)));
      if (!hasRequestedTracks) return;

      const session = await emitAck<{ sessionId: string }>(socket, "media:subscriber:create");
      if (!session.ok) throw new Error(session.error);
      if (cancelled) return;
      connection = new RTCPeerConnection(peerConnectionConfig);
      const pulled = await emitAck<{
        empty?: boolean;
        result?: { sessionDescription: unknown; requiresImmediateRenegotiation?: boolean };
        bindings: TrackBinding[];
      }>(socket, "media:subscriber:pull", {
        sessionId: session.sessionId,
        audioUserIds: audibleUserIds,
        videoUserIds,
      });
      if (!pulled.ok) throw new Error(pulled.error);
      if (cancelled) return;
      if (pulled.empty || !pulled.result) return;

      const bindingByMid = new Map(pulled.bindings.flatMap((binding) => binding.mid ? [[binding.mid, binding] as const] : []));
      connection.addEventListener("track", (event) => {
        const binding = event.transceiver.mid ? bindingByMid.get(event.transceiver.mid) : undefined;
        if (!binding || cancelled) return;
        setRemoteMedia((current) => ({
          ...current,
          [binding.userId]: {
            ...current[binding.userId],
            name: binding.name,
            [binding.kind]: event.track,
          },
        }));
      });

      if (pulled.result.requiresImmediateRenegotiation) {
        await connection.setRemoteDescription(description(pulled.result.sessionDescription));
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        const renegotiated = await emitAck<Record<string, never>>(socket, "media:subscriber:renegotiate", {
          sessionId: session.sessionId,
          sessionDescription: { type: answer.type, sdp: answer.sdp },
        });
        if (!renegotiated.ok) throw new Error(renegotiated.error);
      }
      onError?.("");
    }

    void subscribe().catch(() => {
      if (!cancelled) onError?.("Não foi possível receber a conversa pela Cloudflare.");
    });
    return () => {
      cancelled = true;
      connection?.close();
      setRemoteMedia({});
    };
  // The identity keys prevent renegotiating on every position frame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, socketOnline, socketEpoch, catalog, audibleKey, videoKey, onError]);

  const localVolume = localVideo ? [{ userId: "self", name: self.name, photo: self.photo, isSelf: true }] : [];
  const tiles = [...localVolume, ...nearby.map((person) => ({ ...person, isSelf: false }))];

  return <div className="proximity-room">
    {Object.entries(remoteMedia).map(([userId, media]) => media.audio && peers[userId] ? (
      <RemoteAudio
        key={`audio:${userId}:${media.audio.id}`}
        track={media.audio}
        volume={volumeFor(layout, selfPosition, peers[userId], selfSeat, peers[userId])}
      />
    ) : null)}
    {tiles.length > 0 && <div className="proximity-video-tiles">
      {tiles.map((person) => {
        const video = person.isSelf ? localVideo : remoteMedia[person.userId]?.video;
        return <div className={`proximity-video-tile ${person.isSelf ? "is-self" : ""}`} key={person.userId}>
          {video ? <VideoMedia track={video} /> : person.photo ? <img src={person.photo} alt="" /> : (
            <span className="proximity-video-initial">{person.name.slice(0, 1).toUpperCase()}</span>
          )}
          <label>{person.isSelf ? "Você" : person.name}</label>
        </div>;
      })}
    </div>}
  </div>;
}

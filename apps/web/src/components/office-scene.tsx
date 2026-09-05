import { doorPoint, MEETING_SEAT_SPOTS, roomFurniture, roomWalls, type RoomLike } from "@/lib/office-layout";

type Room = RoomLike;
type Theme = "day" | "neon" | "studio";

function rectStyle(rect: { x: number; y: number; width: number; height: number }) {
  return { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` };
}

function Plant({ room }: { room: Room }) {
  const size = Math.min(room.width, room.height) * .1;
  return (
    <div
      className="office-plant"
      style={{ left: `${room.x + room.width * .91}%`, top: `${room.y + room.height * .88}%`, width: `${size}%`, height: `${size}%` }}
      aria-hidden="true"
    >
      <span className="office-plant-leaves" />
      <span className="office-plant-pot" />
    </div>
  );
}

function Furniture({ room }: { room: Room }) {
  return (
    <>
      {roomFurniture(room).map((piece, index) => (
        <div key={index} className={`office-piece office-piece-${piece.shape}`} style={rectStyle(piece)}>
          {piece.shape === "table" && (
            <>
              <span className="office-piece-runner" />
              <span className="office-piece-screen" />
              {MEETING_SEAT_SPOTS.map(([fx, fy], seatIndex) => (
                <span
                  key={seatIndex}
                  className="office-chair-dot"
                  style={{
                    left: `${((room.x + room.width * fx - piece.x) / piece.width) * 100}%`,
                    top: `${((room.y + room.height * fy - piece.y) / piece.height) * 100}%`,
                  }}
                />
              ))}
            </>
          )}
          {piece.shape === "desk" && (
            <>
              <span className="office-piece-screen" />
              <span className="office-piece-keyboard" />
              <span className="office-piece-chair" />
            </>
          )}
          {piece.shape === "cabinet" && (
            <>
              <span className="office-piece-drawer" style={{ top: "22%" }} />
              <span className="office-piece-drawer" style={{ top: "56%" }} />
            </>
          )}
        </div>
      ))}
      {room.kind === "SOCIAL" && (
        <span
          className="office-tv"
          style={{ left: `${room.x + room.width * .76}%`, top: `${room.y + room.height * .1}%`, width: `${room.width * .12}%`, height: `${room.height * .2}%` }}
        />
      )}
      <Plant room={room} />
    </>
  );
}

function Door({ room, open }: { room: Room; open: boolean }) {
  const point = doorPoint(room);
  return (
    <div className={`office-door${open ? " open" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-hidden="true">
      <span className="office-door-panel" />
      <span className="office-door-swing" />
    </div>
  );
}

export function OfficeScene({ rooms, openDoorIds = [] }: { rooms: Room[]; theme: Theme; openDoorIds?: string[] }) {
  const openSet = new Set(openDoorIds);
  return (
    <div className="office-scene">
      <div className="office-floor" />
      <div className="office-vignette" aria-hidden="true" />
      {rooms.map((room) => (
        <div key={room.id} className={`office-room office-room-${room.kind.toLowerCase()}`} style={rectStyle(room)}>
          <span className="office-rug" />
        </div>
      ))}
      {rooms.flatMap((room) =>
        roomWalls(room, openSet.has(room.id)).map((wall, index) => (
          <div key={`${room.id}-wall-${index}`} className="office-wall" style={rectStyle(wall)} />
        )),
      )}
      {rooms.map((room) => <Furniture key={`${room.id}-furniture`} room={room} />)}
      {rooms.map((room) => <Door key={`${room.id}-door`} room={room} open={openSet.has(room.id)} />)}
    </div>
  );
}

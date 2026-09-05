-- The creation room is a four-person team, like each squad.
UPDATE "Room"
SET "capacity" = 4
WHERE "name" = 'Sala de criação'
  AND "spaceId" IN (SELECT "id" FROM "Space" WHERE "isDefault" = true);

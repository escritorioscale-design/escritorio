-- Reorganize the original four-room seed into the six-room office layout.
UPDATE "Room"
SET "name" = 'Sala de criação', "x" = 36, "y" = 5, "width" = 28, "height" = 30, "capacity" = 12, "kind" = 'SOCIAL'
WHERE "name" = 'Lounge';

UPDATE "Room"
SET "name" = 'Squad 1', "x" = 4, "y" = 44, "width" = 28, "height" = 46, "capacity" = 4, "kind" = 'FOCUS'
WHERE "name" = 'Zona de foco';

UPDATE "Room"
SET "name" = 'Sala de reunião geral', "x" = 4, "y" = 5, "width" = 28, "height" = 30, "capacity" = 24, "kind" = 'MEETING'
WHERE "name" = 'Sala Aurora';

UPDATE "Room"
SET "name" = 'Sala do gerente', "x" = 68, "y" = 5, "width" = 28, "height" = 30, "capacity" = 4, "kind" = 'PROXIMITY', "isPrivate" = true
WHERE "name" = 'Jardim';

INSERT INTO "Room" ("id", "spaceId", "name", "kind", "x", "y", "width", "height", "capacity", "isPrivate")
SELECT substr(md5(random()::text || s."id"), 1, 25), s."id", 'Squad 2', 'FOCUS', 36, 44, 28, 46, 4, false
FROM "Space" s
WHERE s."isDefault" = true
  AND NOT EXISTS (SELECT 1 FROM "Room" r WHERE r."spaceId" = s."id" AND r."name" = 'Squad 2');

INSERT INTO "Room" ("id", "spaceId", "name", "kind", "x", "y", "width", "height", "capacity", "isPrivate")
SELECT substr(md5(random()::text || s."id" || 'squad3'), 1, 25), s."id", 'Squad 3', 'FOCUS', 68, 44, 28, 46, 4, false
FROM "Space" s
WHERE s."isDefault" = true
  AND NOT EXISTS (SELECT 1 FROM "Room" r WHERE r."spaceId" = s."id" AND r."name" = 'Squad 3');

UPDATE "Space"
SET "mapVersion" = 2,
    "mapData" = jsonb_set(
      jsonb_set(COALESCE("mapData", '{}'::jsonb), '{version}', '2'::jsonb, true),
      '{layout}', '"six-room-grid"'::jsonb, true
    )
WHERE "isDefault" = true;

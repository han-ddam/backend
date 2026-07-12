-- Custom SQL migration file, put your code below! --

CREATE INDEX IF NOT EXISTS "place_geog_idx" ON "place" USING GIST (
  (ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography)
) WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL;
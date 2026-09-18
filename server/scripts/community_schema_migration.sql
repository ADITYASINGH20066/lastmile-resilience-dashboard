-- Run once in Supabase SQL Editor before using the community login API.

ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (
    role IN (
        'admin',
        'control_room',
        'village_authority',
        'disaster_authority',
        'community_member',
        'observer'
    )
);

ALTER TABLE community_reports
ADD COLUMN IF NOT EXISTS reporter_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE community_reports
ADD COLUMN IF NOT EXISTS station_id UUID
    REFERENCES hydro_stations(id) ON DELETE SET NULL;

ALTER TABLE alert_deliveries
ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE hydro_readings
ADD COLUMN IF NOT EXISTS replayed_at TIMESTAMPTZ;

-- Optional but useful for the UI/demo.
CREATE INDEX IF NOT EXISTS idx_community_reports_station_time
ON community_reports (station_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_reports_reporter
ON community_reports (reporter_user_id);

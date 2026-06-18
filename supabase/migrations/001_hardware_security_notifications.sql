-- Hotel Fountain CRM – Migration 001
-- Hardware Security, Reservation Requests & Notifications
-- Applied to project: bgqsorvxbytttrvbjder (Hotel Fountain New)

-- 1. Authorised Devices (Hardware Whitelist)
CREATE TABLE IF NOT EXISTS authorized_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_address      TEXT,
  motherboard_uuid TEXT,
  device_name      TEXT NOT NULL,
  is_authorized    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_at_least_one_id CHECK (
    mac_address IS NOT NULL OR motherboard_uuid IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_devices_mac   ON authorized_devices (mac_address);
CREATE INDEX IF NOT EXISTS idx_devices_uuid  ON authorized_devices (motherboard_uuid);
CREATE INDEX IF NOT EXISTS idx_devices_auth  ON authorized_devices (is_authorized);

ALTER TABLE authorized_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages devices"
  ON authorized_devices FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Reservation Requests (landing-page form submissions)
--    Separate from the operational reservations table
CREATE TABLE IF NOT EXISTS reservation_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name       TEXT NOT NULL,
  guest_email      TEXT NOT NULL,
  guest_phone      TEXT,
  room_category    TEXT NOT NULL,
  room_number      TEXT,
  check_in_date    DATE NOT NULL,
  check_out_date   DATE NOT NULL,
  num_guests       INT NOT NULL DEFAULT 1,
  rate_per_night   NUMERIC(10,2) NOT NULL,
  total_amount     NUMERIC(10,2),
  special_requests TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_req_dates  CHECK (check_out_date > check_in_date),
  CONSTRAINT chk_req_guests CHECK (num_guests >= 1)
);

CREATE INDEX IF NOT EXISTS idx_req_status   ON reservation_requests (status);
CREATE INDEX IF NOT EXISTS idx_req_email    ON reservation_requests (guest_email);
CREATE INDEX IF NOT EXISTS idx_req_created  ON reservation_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_checkin  ON reservation_requests (check_in_date);

ALTER TABLE reservation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit reservation requests"
  ON reservation_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role full access to reservation_requests"
  ON reservation_requests FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Dashboard Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL DEFAULT 'system'
                   CHECK (type IN ('reservation','system','alert')),
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  reservation_id   UUID REFERENCES reservation_requests(id) ON DELETE SET NULL,
  is_read          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications (is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_res_id   ON notifications (reservation_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Public can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- 4. Helper: auto-calculate total_amount on insert
CREATE OR REPLACE FUNCTION calculate_reservation_request_total()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_amount IS NULL THEN
    NEW.total_amount := (NEW.check_out_date - NEW.check_in_date) * NEW.rate_per_night;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_reservation_request_total
  BEFORE INSERT ON reservation_requests
  FOR EACH ROW EXECUTE FUNCTION calculate_reservation_request_total();

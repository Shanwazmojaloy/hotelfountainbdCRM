export interface Lead {
  id?: string;
  name: string;
  company?: string;
  email?: string;
  event_details?: string;
  expected_guests?: number;
  venue_preference?: 'Banquet' | 'Restaurant' | 'Rooftop' | 'Hotel Room' | 'Lodging';
  source: string;
  created_at?: string;
}

export interface Transaction {
  id?: string;
  lead_id: string;
  room_number?: string;
  check_in_date?: string;
  check_out_date?: string;
  amount: number;
  status: string;
  created_at?: string;
}

// ─── Room Categories ──────────────────────────────────────────────────────────
export interface RoomCategory {
  id?: string;
  name: string;
  rate_per_night: number;
  description?: string;
  amenities?: string[];
  max_guests: number;
  total_rooms: number;
}

export const ROOM_CATEGORIES: RoomCategory[] = [
  {
    name: 'Fountain Deluxe',
    rate_per_night: 3500,
    description: 'Elegant deluxe room with fountain view and premium amenities.',
    amenities: ['King Bed', 'AC', 'Free WiFi', 'Mini Bar', 'Fountain View'],
    max_guests: 2,
    total_rooms: 20,
  },
  {
    name: 'Fountain Executive',
    rate_per_night: 5500,
    description: 'Spacious executive suite with separate sitting area.',
    amenities: ['King Bed', 'AC', 'Free WiFi', 'Mini Bar', 'Sitting Lounge', 'Bathtub'],
    max_guests: 3,
    total_rooms: 10,
  },
  {
    name: 'Fountain Standard',
    rate_per_night: 2200,
    description: 'Comfortable standard room with all essential amenities.',
    amenities: ['Double Bed', 'AC', 'Free WiFi', 'TV'],
    max_guests: 2,
    total_rooms: 30,
  },
  {
    name: 'Fountain Suite',
    rate_per_night: 8500,
    description: 'Premium suite with panoramic views and butler service.',
    amenities: ['King Bed', 'AC', 'Free WiFi', 'Mini Bar', 'Sitting Lounge', 'Jacuzzi', 'Butler Service'],
    max_guests: 4,
    total_rooms: 5,
  },
];

// ─── Reservation Request (landing-page form submission) ───────────────────────
export interface Reservation {
  id?: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  room_category: string;
  room_number?: string;
  check_in_date: string;
  check_out_date: string;
  num_guests: number;
  rate_per_night: number;
  total_amount?: number;
  special_requests?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at?: string;
}

// ─── Dashboard Notification ───────────────────────────────────────────────────
export interface DashboardNotification {
  id?: string;
  type: 'reservation' | 'system' | 'alert';
  title: string;
  message: string;
  reservation_id?: string;
  is_read: boolean;
  created_at?: string;
}

// ─── Hardware Security ────────────────────────────────────────────────────────
export interface AuthorizedDevice {
  id?: string;
  mac_address?: string;
  motherboard_uuid?: string;
  device_name: string;
  is_authorized: boolean;
  created_at?: string;
}

export interface HardwareCheckResult {
  authorized: boolean;
  read_only: boolean;
  reason?: string;
  device?: AuthorizedDevice;
}

// ─── Roles & Permissions ──────────────────────────────────────────────────────
export type UserRole = 'admin' | 'front_office' | 'front_desk_sales_lead' | 'manager';

export interface RolePermissions {
  canViewFinancials: boolean;
  canViewStaffManagement: boolean;
  canViewGeneralSettings: boolean;
  canViewB2BPartners: boolean;
  canViewFrontDeskSales: boolean;
  canConfirmReservations: boolean;
  canAssignRooms: boolean;
  isReadOnly: boolean;
}

export interface AppUser {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
}

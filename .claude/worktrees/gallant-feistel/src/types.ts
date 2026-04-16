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

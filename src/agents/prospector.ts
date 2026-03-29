import { Lead } from '../types';

/**
 * Agent A: The Prospector
 * Job: Scours the web/social media for potential clients (e.g., event planners in Dhaka needing rooms).
 * Action: Finds a lead and returns it to be saved into Supabase.
 */

export class ProspectorAgent {
  async findLeads(): Promise<Lead[]> {
    console.log('[Agent A: Prospector] Scanning for new leads...');
    // In Phase 2, we target guests looking for hotel rooms, as well as corporate & events looking for banquet, restaurant, rooftop (max 200 persons).
    
    return [
      {
        name: 'John Doe',
        company: 'Dhaka Event Planners Ltd',
        email: 'john.doe@example.com',
        event_details: 'Upcoming corporate retreat requiring space for a seminar and evening dinner.',
        expected_guests: 150,
        venue_preference: 'Banquet',
        source: 'LinkedIn Event Search'
      },
      {
        name: 'Jane Smith',
        company: 'Tech Summit BD',
        email: 'jane.smith@techsummit.bd',
        event_details: 'Annual tech networking mixer.',
        expected_guests: 180,
        venue_preference: 'Rooftop',
        source: 'Web Scraping (Corporate)'
      },
      {
        name: 'Ali Rahman',
        company: 'Innovate Marketing',
        email: 'ali.rahman@innovate.bd',
        event_details: 'Company milestone celebration dinner.',
        expected_guests: 80,
        venue_preference: 'Restaurant',
        source: 'Facebook Groups'
      },
      {
        name: 'Sarah Rahman',
        email: 'sarah.rahman@example.com',
        event_details: 'Family vacation needing 2 rooms.',
        expected_guests: 4,
        venue_preference: 'Hotel Room',
        source: 'Booking Inquiry'
      }
    ];
  }
}

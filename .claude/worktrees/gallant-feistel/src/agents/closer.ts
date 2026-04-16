import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendToMakeWebhook } from '../services/make';
import { Lead, Transaction } from '../types';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Agent B: The Closer + Stay Assistant
 * Job: Drafts personalized pitches for new leads AND handles Check-In/Check-Out lifecycles.
 */

export class CloserAgent {
  
  async draftAndSendPitch(lead: Lead) {
    if (!apiKey) return;
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const prompt = `
          You are a professional hotel sales manager for "Hotel Fountain" in Dhaka. Write a personalized email.
          Lead: ${lead.name} from ${lead.company}
          They want a ${lead.venue_preference} for ${lead.expected_guests} guests.
          Event Details: ${lead.event_details}
          Offer them a corporate packaged rate. 1-2 paragraphs max.
        `;
        const result = await model.generateContent(prompt);
        await sendToMakeWebhook({
            action: 'send_email', lead_email: lead.email,
            subject: `Hotel Fountain Corporate ${lead.venue_preference} Package - ${lead.company}`,
            body: result.response.text()
        });
        console.log(`[Agent B: Closer] Sent pitch for ${lead.company} regarding a ${lead.venue_preference} event.`);
    } catch (error) {
        console.error('[Agent B: Closer] Failed to send pitch:', error);
    }
  }

  async sendCheckInEmail(lead: Lead, transaction: Transaction) {
    if (!apiKey) return;
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const prompt = `
          You are the Hotel Fountain reception manager. Write a brief "Welcome/Check-In" email to ${lead.name} (${lead.company || 'Guest'}).
          They have checked into Room/Venue ${transaction.room_number} on ${transaction.check_in_date}.
          Their estimated bill is $${transaction.amount}.
          Welcome them and provide stay/billing details in a professional tone.
        `;
        const result = await model.generateContent(prompt);
        await sendToMakeWebhook({
            action: 'send_email', lead_email: lead.email,
            subject: `Welcome to Hotel Fountain - Check-In Details`,
            body: result.response.text()
        });
        console.log(`[Agent B: Assistant] Sent Check-In email to ${lead.name} (Room ${transaction.room_number}).`);
    } catch (error) {
        console.error('[Agent B: Assistant] Failed to send Check-In email:', error);
    }
  }

  async sendCheckOutEmail(lead: Lead, transaction: Transaction) {
    if (!apiKey) return;
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const prompt = `
          You are the Hotel Fountain reception manager. Write a brief "Thank You/Check-Out" email to ${lead.name} (${lead.company || 'Guest'}) who just checked out.
          They stayed in Room/Venue ${transaction.room_number}. Check-out date: ${transaction.check_out_date}.
          Total Bill processed: $${transaction.amount}.
          Thank them warmly and attach the final billing details in text. Ask them to visit again.
        `;
        const result = await model.generateContent(prompt);
        await sendToMakeWebhook({
            action: 'send_email', lead_email: lead.email,
            subject: `Thank you for staying at Hotel Fountain - Final Bill`,
            body: result.response.text()
        });
        console.log(`[Agent B: Assistant] Sent Check-Out email to ${lead.name} with bill $${transaction.amount}.`);
    } catch (error) {
        console.error('[Agent B: Assistant] Failed to send Check-Out email:', error);
    }
  }
}

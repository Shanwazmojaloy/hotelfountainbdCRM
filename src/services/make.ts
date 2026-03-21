import axios from 'axios';
import * as dotenv from 'dotenv';
import { Lead, Transaction } from '../types';

dotenv.config();

const webhookUrl = process.env.MAKE_WEBHOOK_URL || '';

export async function sendToMakeWebhook(payload: any) {
  if (!webhookUrl) {
    console.warn('MAKE_WEBHOOK_URL is not configured in .env');
    return null;
  }
  
  try {
    const response = await axios.post(webhookUrl, payload);
    return response.data;
  } catch (error) {
    console.error('Error sending data to Make.com webhook:', error);
    throw error;
  }
}

// Backup transaction to Make.com to proxy to Google Sheets
export async function backupTransaction(transaction: Transaction, lead: Lead) {
  return sendToMakeWebhook({
    action: 'backup_transaction',
    transaction,
    lead
  });
}

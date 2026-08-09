import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const posPhase2 = flag<boolean>({
  key: 'pos-phase2',
  adapter: vercelAdapter(),
  defaultValue: false,
  description: 'Restaurant/POS Phase 2 money+folio sync',
  options: [
    { value: false, label: 'Off' },
    { value: true, label: 'On' },
  ],
});
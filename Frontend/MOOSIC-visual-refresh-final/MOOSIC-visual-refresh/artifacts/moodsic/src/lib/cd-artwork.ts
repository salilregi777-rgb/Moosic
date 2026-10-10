import happy from '@assets/cd-artwork/happy.webp';
import happySmall from '@assets/cd-artwork/happy-768.webp';
import sad from '@assets/cd-artwork/sad.webp';
import sadSmall from '@assets/cd-artwork/sad-768.webp';
import neutral from '@assets/cd-artwork/neutral.webp';
import neutralSmall from '@assets/cd-artwork/neutral-768.webp';
import angry from '@assets/cd-artwork/angry.webp';
import angrySmall from '@assets/cd-artwork/angry-768.webp';
import exhausted from '@assets/cd-artwork/exhausted.webp';
import exhaustedSmall from '@assets/cd-artwork/exhausted-768.webp';

// Every CD surface, including the next-mood transition, uses this same edition.
export const CD_ARTWORK = { Happy: happy, Sad: sad, Neutral: neutral, Angry: angry, Exhausted: exhausted };
export const CD_ARTWORK_SRCSETS: Record<string, string> = Object.fromEntries([
  [happy, happySmall], [sad, sadSmall], [neutral, neutralSmall], [angry, angrySmall], [exhausted, exhaustedSmall],
].map(([large, small]) => [large, `${small} 768w, ${large} 2048w`]));

export const CD_PHOTO_CREDITS = {
  Happy: { photographer: 'Luis Quintero', url: 'https://www.pexels.com/photo/smiling-friends-sitting-on-stairs-17674143/' },
  Sad: { photographer: 'Ketut Subiyanto', url: 'https://www.pexels.com/photo/pensive-woman-with-glass-of-coffee-standing-behind-big-window-4350190/' },
  Neutral: { photographer: 'Wolf Art', url: 'https://www.pexels.com/photo/man-sitting-on-metro-station-16390532/' },
  Angry: { photographer: 'Alena Darmel', url: 'https://www.pexels.com/photo/a-man-playing-drums-at-a-concert-7715785/' },
  Exhausted: { photographer: 'MART PRODUCTION', url: 'https://www.pexels.com/photo/a-woman-fall-asleep-on-a-desk-7606069/' },
};

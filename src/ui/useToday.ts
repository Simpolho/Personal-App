import { useEffect, useState } from 'react';
import { localDate } from '../domain/dates';

/** Today's date, kept current when the app comes back from the background on a new day. */
export function useToday(): string {
  const [today, setToday] = useState(() => localDate(new Date()));
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setToday(localDate(new Date()));
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);
  return today;
}

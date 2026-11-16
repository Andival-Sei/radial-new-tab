import { memo, useEffect, useState } from 'react';
import type { Settings } from '../types';

export const Clock = memo(function Clock({
  locale,
  settings,
}: {
  locale: string;
  settings: Settings;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const update = () => {
      const date = new Date();
      setNow(date);
      const interval = settings.showSeconds ? 1000 : 60_000;
      timer = window.setTimeout(update, interval - (date.getTime() % interval) + 20);
    };
    update();
    const onVisible = () => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        update();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [settings.showSeconds]);
  const clock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: settings.showSeconds ? '2-digit' : undefined,
    hour12: !settings.clock24,
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  return (
    <div className="clock-block">
      <time className="clock" dateTime={now.toISOString()}>
        {clock}
      </time>
      <div className="date-line">{date}</div>
    </div>
  );
});

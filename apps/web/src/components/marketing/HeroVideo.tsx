'use client';

import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Home hero: the 25-second "listing to lifting" journey video (source: Images/BidON_Hero_v2).
 * Autoplays muted and loops (browsers block autoplay with sound); visitors can turn sound on or pause.
 * With reduced motion requested it stays on the poster until played.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.play().catch(() => setPlaying(false));
  }, []);

  function toggleSound() {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) void v.play();
  }

  function togglePlay() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  const btn =
    'inline-flex size-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-md hover:bg-primary-hover';

  return (
    <div className="relative aspect-video min-w-0 overflow-hidden rounded-lg bg-text-strong">
      <video
        ref={ref}
        className="size-full object-cover"
        src="/videos/bidon-journey.mp4"
        poster="/videos/bidon-journey-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="How a Bid ON auction works: list your lot, get approved, bid live, win and pay, lift, and weigh and settle"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="absolute top-sm right-sm flex gap-xs">
        <button
          type="button"
          onClick={togglePlay}
          className={btn}
          aria-label={playing ? 'Pause video' : 'Play video'}
        >
          {playing ? (
            <Pause className="size-5" aria-hidden />
          ) : (
            <Play className="size-5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={toggleSound}
          className={btn}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          aria-pressed={!muted}
        >
          {muted ? (
            <VolumeX className="size-5" aria-hidden />
          ) : (
            <Volume2 className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

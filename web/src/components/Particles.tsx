import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface Dot {
  x: number;
  y: number;
  r: number;
  v: number;
  a: number;
  c: string;
}

/**
 * A few slowly rising dots behind the page. It draws nothing when the visitor prefers reduced motion,
 * stops while the tab is hidden, and is switched off while a game is playing so it never competes for frames.
 */
export function Particles({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let frame = 0;

    const setup = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(Math.min(46, Math.max(18, width / 32)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.6 + 0.6,
        v: Math.random() * 0.25 + 0.08,
        a: Math.random() * 0.5 + 0.2,
        c: Math.random() < 0.5 ? '157,92,255' : '41,225,255',
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (const d of dots) {
        d.y -= d.v;
        if (d.y < -4) {
          d.y = height + 4;
          d.x = Math.random() * width;
        }
        ctx.fillStyle = `rgba(${d.c},${d.a})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(tick);
    };

    const run = () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      if (reduceMotion || paused || document.hidden) return;
      frame = requestAnimationFrame(tick);
    };

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setup();
        run();
      }, 200);
    };

    setup();
    run();
    document.addEventListener('visibilitychange', run);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('resize', onResize);
    };
  }, [reduceMotion, paused]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}

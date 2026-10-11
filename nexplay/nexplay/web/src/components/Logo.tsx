import { useId } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../lib/site';

export function Logo({ to = '/', label = `${site.name} home` }: { to?: string; label?: string }) {
  const gradient = useId();
  return (
    <Link to={to} aria-label={label} className="flex shrink-0 items-center gap-2.5 no-underline">
      <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9d5cff" />
            <stop offset="1" stopColor="#29e1ff" />
          </linearGradient>
        </defs>
        <rect x="1.5" y="1.5" width="37" height="37" rx="12" fill="rgba(255,255,255,.08)" stroke={`url(#${gradient})`} strokeWidth="1.5" />
        <path d="M12 29V11l16 18V11" fill="none" stroke={`url(#${gradient})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[1.02rem] font-bold leading-none tracking-[0.04em]">{site.name}</span>
    </Link>
  );
}

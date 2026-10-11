import { useEffect } from 'react';
import { site } from '../lib/site';

export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} | ${site.name}` : site.name;
  }, [title]);
}

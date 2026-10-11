import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** One gentle fade-and-rise when the page changes. MotionConfig turns it off for reduced-motion visitors. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

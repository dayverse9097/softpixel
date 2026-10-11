import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { envProblems } from './lib/env';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const problems = envProblems();
if (problems.length > 0) {
  // A misconfigured build should say so plainly instead of failing in confusing ways later.
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.className = 'wrap';
  box.textContent = `This site is not configured correctly: ${problems.join(' ')}`;
  container.appendChild(box);
} else {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

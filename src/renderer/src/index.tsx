import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Placeholder shell. The real tabs (Upcoming, Reminders, Settings) come later.
function App() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-900 text-slate-100">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Nudge</h1>
        <p className="mt-2 text-sm text-slate-400">Running in the system tray.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

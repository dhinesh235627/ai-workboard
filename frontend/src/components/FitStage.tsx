import type { ReactNode } from 'react';

// Pages are fluid (flex/grid) and fill this container directly — no
// transform-scale here. A single non-uniform scale used to fill the window
// exactly, but it stretched fonts and icons out of proportion on any window
// whose aspect ratio wasn't exactly 1440:900. Fixed-size internal blocks
// that still need to shrink without distortion use ScaleFrame instead,
// which scales uniformly from its own container rather than the window.
export default function FitStage({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0B0B0D' }}>
      {children}
    </div>
  );
}

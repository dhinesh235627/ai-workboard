import { Link } from 'react-router-dom';

type Props = { active: string | null };

export default function Sidebar({ active }: Props) {
  const cls = (to: string) => (active === to ? 'nav on' : 'nav');
  return (
    <nav aria-label="Primary" style={{ width: '88px', flexShrink: '0', borderRight: '1px solid #1F1F24', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: '8px' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#F4F4F5', color: '#0B0B0D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '18px', marginBottom: '20px' }}>
        L
      </div>
      <Link className={cls('/')} to="/">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />
        </svg>
        Home
      </Link>
      <Link className={cls('/learn')} to="/learn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M10 9l5 3-5 3z" />
        </svg>
        Learn
      </Link>
      <Link className={cls('/labs')} to="/labs">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" />
        </svg>
        Labs
      </Link>
      <Link className={cls('/results')} to="/results">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <circle cx="12" cy="9" r="6" />
          <path d="M8.5 14 7 22l5-3 5 3-1.5-8" />
        </svg>
        Results
      </Link>
      <div style={{ flexGrow: '1' }} />
      <Link className={cls('/admin')} to="/admin">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 6h10M4 12h4M12 12h8M4 18h12" />
          <circle cx="17" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
        Admin
      </Link>
    </nav>
  );
}

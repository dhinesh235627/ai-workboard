import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import RoboAiLogo from '../components/RoboAiLogo';
import { fetchCertificate, formatDate, type Certificate } from '../lib/certificates';
import pageCss from './Results.css?inline';

type State = { status: 'loading' } | { status: 'found'; cert: Certificate } | { status: 'missing' } | { status: 'error' };

// Public page the certificate's QR code opens. Anyone can check that an ID was
// really issued by ROBO&AI, without signing in.
export default function Verify() {
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchCertificate(id)
      .then((cert) => {
        if (!cancelled) setState(cert ? { status: 'found', cert } : { status: 'missing' });
      })
      .catch((err) => {
        console.error('Failed to verify certificate', err);
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const valid = state.status === 'found' && state.cert.status === 'valid';
  const pill = (bg: string, fg: string, text: string) => (
    <span style={{ alignSelf: 'flex-start', fontSize: '12px', fontWeight: '600', letterSpacing: '0.1em', padding: '6px 12px', borderRadius: '999px', background: bg, color: fg }}>
      {text}
    </span>
  );
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', fontSize: '14px', padding: '12px 0', borderTop: '1px solid #26262C' }}>
      <span style={{ color: '#8B8B94' }}>{label}</span>
      <span style={{ color: '#F4F4F5', fontWeight: '500', textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: '100%', height: '100%', background: '#0B0B0D', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
        <main style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#F4F4F5' }}>
            <RoboAiLogo size={30} color="#F4F4F5" face="#0B0B0D" />
            <span style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '0.16em' }}>ROBO&amp;AI</span>
            <span style={{ fontSize: '12px', color: '#8B8B94', letterSpacing: '0.12em' }}>· CERTIFICATE VERIFICATION</span>
          </div>
          <section style={{ padding: '28px', borderRadius: '24px', background: '#151518', border: '1px solid #1F1F24', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {state.status === 'loading' && <div style={{ color: '#A1A1AA', fontSize: '14px' }}>Checking certificate…</div>}
            {state.status === 'error' && (
              <>
                {pill('#1F1F24', '#D4D4D8', 'UNABLE TO CHECK')}
                <div style={{ color: '#A1A1AA', fontSize: '14px' }}>We couldn't reach the verification service. Please try again in a moment.</div>
              </>
            )}
            {state.status === 'missing' && (
              <>
                {pill('rgba(255,69,58,0.14)', '#FF6B63', 'NOT FOUND')}
                <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '600', letterSpacing: '-0.02em' }}>No certificate with this ID</h1>
                <div style={{ color: '#A1A1AA', fontSize: '14px', lineHeight: 1.6 }}>
                  <span style={{ fontFamily: "'Geist Mono', monospace", color: '#D4D4D8' }}>{id}</span> was not issued by ROBO&amp;AI. Check the ID on the certificate, or scan its QR code again.
                </div>
              </>
            )}
            {state.status === 'found' && (
              <>
                {valid ? pill('rgba(48,209,88,0.14)', '#5BE584', '✓ VALID CERTIFICATE') : pill('rgba(255,69,58,0.14)', '#FF6B63', 'REVOKED')}
                <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '40px', lineHeight: 1.05, letterSpacing: '-0.01em' }}>{state.cert.holderName}</div>
                <div style={{ color: '#A1A1AA', fontSize: '15px', lineHeight: 1.6 }}>
                  completed <span style={{ color: '#F4F4F5', fontWeight: '600' }}>{state.cert.courseTitle}</span> in a live Azure environment.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {row('Issued by', state.cert.issuer)}
                  {row('Issued on', formatDate(state.cert.issuedAt))}
                  {row('Certificate ID', state.cert.id)}
                  {row('Overall score', String(state.cert.scores.overall))}
                </div>
              </>
            )}
          </section>
          <div style={{ fontSize: '12px', color: '#8B8B94' }}>Prepares you for the vendor exam. Not a vendor certification.</div>
          <Link to="/" style={{ fontSize: '14px' }}>Back to Learnly</Link>
        </main>
      </div>
    </>
  );
}

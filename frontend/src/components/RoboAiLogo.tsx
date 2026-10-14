type Props = { size?: number; color?: string; face?: string };

// Mock ROBO&AI mark: a rounded robot-head square with antenna, eyes and mouth.
// Same geometry the certificate PDF draws, so the on-screen card and the PDF match.
export default function RoboAiLogo({ size = 28, color = '#1A1A1A', face = '#F5F2EA' }: Props) {
  return (
    <svg width={size} height={size * 1.17} viewBox="0 -8 48 56" role="img" aria-label="ROBO&AI logo">
      <line x1="24" y1="2" x2="24" y2="-5" stroke={color} strokeWidth="1.8" />
      <circle cx="24" cy="-6" r="2.6" fill={color} />
      <rect x="0" y="0" width="48" height="48" rx="12" fill={color} />
      <circle cx="16" cy="20" r="4.5" fill={face} />
      <circle cx="32" cy="20" r="4.5" fill={face} />
      <line x1="15" y1="34" x2="33" y2="34" stroke={face} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

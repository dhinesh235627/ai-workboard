export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';
const CERTIFICATES_URL = `${API_BASE}/api/certificates`;
const STORAGE_KEY = 'roboai.certificateId';

export type Certificate = {
  id: string;
  holderName: string;
  courseTitle: string;
  issuer: string;
  issuedAt: string;
  status: 'valid' | 'revoked';
  scores: { overall: number; quizzes: number; lab: number; rubric: number };
  verifyUrl: string;
};

export type Scores = Certificate['scores'];

// The learner's issued certificate ID is remembered in this browser so the
// Results page shows the same certificate on every visit.
export function savedCertificateId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCertificateId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked (private window etc.) — the certificate still works, just isn't remembered
  }
}

export async function issueCertificate(holderName: string, scores: Scores): Promise<Certificate> {
  const res = await fetch(CERTIFICATES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holderName, scores }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}`);
  return data as Certificate;
}

// Resolves to null when the certificate doesn't exist; throws on network/server errors.
export async function fetchCertificate(id: string): Promise<Certificate | null> {
  const res = await fetch(`${CERTIFICATES_URL}/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return (await res.json()) as Certificate;
}

export const pdfUrl = (id: string) => `${CERTIFICATES_URL}/${encodeURIComponent(id)}/pdf`;

export function linkedInUrl(c: Certificate) {
  const d = new Date(c.issuedAt);
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.courseTitle,
    organizationName: c.issuer,
    issueYear: String(d.getUTCFullYear()),
    issueMonth: String(d.getUTCMonth() + 1),
    certUrl: c.verifyUrl,
    certId: c.id,
  });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

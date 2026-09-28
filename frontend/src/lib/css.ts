import type { CSSProperties } from 'react';

// Parses an inline CSS declaration string ("color: red; font-size: 12px") into a React style object.
export function css(text: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const key = prop.startsWith('-webkit-')
      ? 'Webkit' + camel(prop.slice(8)).replace(/^./, (c) => c.toUpperCase())
      : camel(prop);
    style[key] = decl.slice(i + 1).trim();
  }
  return style as CSSProperties;
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

import type { Metadata, Viewport } from 'next';
import { type ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LifeOS', template: '%s · LifeOS' },
  description: 'Your personal operating system for goals, time and habits.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

/**
 * Applies an explicit appearance override (Settings) before first paint.
 * "system" (the default) leaves the OS preference in charge.
 */
const themeScript = `try{var t=localStorage.getItem('lifeos-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

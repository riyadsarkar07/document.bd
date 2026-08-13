import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { ToastProvider } from '@/lib/toast/toast-provider';
import { AuthProvider } from '@/lib/auth/auth-context';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Document Studio — BD Gov Portal',
  description:
    'IP Trademark Certificate & National ID design and export platform (Supabase powered).',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('studio.theme')||'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;var d=document.documentElement;d.classList.toggle('dark',r==='dark');d.classList.toggle('light',r==='light');d.style.colorScheme=r;}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`grain ${playfair.variable} ${dmSans.variable} ${dmMono.variable}`}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

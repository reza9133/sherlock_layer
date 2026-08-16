import { Special_Elite, Cinzel } from 'next/font/google';
import './globals.css';

const typewriterFont = Special_Elite({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-typewriter',
  display: 'swap',
});

const caseFont = Cinzel({
  weight: ['400', '600', '700', '900'],
  subsets: ['latin'],
  variable: '--font-case',
  display: 'swap',
});

export const metadata = {
  title: 'SherlockLayer — Decentralized Mystery Adjudication',
  description:
    'Open Mystery Cases, deposit a GEN bounty, and let GenLayer AI consensus adjudicate the solve.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${typewriterFont.variable} ${caseFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}

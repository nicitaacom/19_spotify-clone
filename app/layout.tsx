import './globals.css'
import { Figtree } from 'next/font/google'

import Sidebar from './components/Sidebar'

const figtree = Figtree({ subsets: ['latin'] })

export const metadata = {
  title: 'Spotify clone',
  description: 'Listen to music!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={figtree.className}>
        <Sidebar>
        {children}
        </Sidebar>
        </body>
    </html>
  )
}

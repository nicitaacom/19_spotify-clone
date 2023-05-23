import './globals.css'
import { Inter } from 'next/font/google'
import { Nunito } from 'next/font/google'
import Navbar from './components/navbar/Navbar'
import ClientOnly from './components/ClientOnly'
import RegisterModal from './components/modals/RegisterModal'
import LoginModal from './components/modals/LoginModal'
import ToasterProvider from './providers/ToasterProvider'
import getCurrnetUser from './actions/getCurrentUser'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Airbnb',
  description: 'Airbnb clone',
}

const font = Nunito({
  subsets:['latin']
})

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentUser = await getCurrnetUser()
  return (
    <html lang="en">
      <body className={font.className}>
        <ClientOnly>
          <ToasterProvider/>
          <LoginModal/>
          <RegisterModal/>
          <Navbar currentUser={currentUser}/>
        </ClientOnly>
        {children}
        </body>
    </html>
  )
}

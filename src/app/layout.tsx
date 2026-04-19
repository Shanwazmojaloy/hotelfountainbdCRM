
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col md:flex-row flex-col bg-gradient-to-br from-slate-900 via-teal-950 to-black antialiased">
        {children}
      </body>
    </html>
  );
}

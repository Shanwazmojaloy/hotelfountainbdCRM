
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col antialiased" style={{ background: '#07090E' }}>
        {children}
      </body>
    </html>
  );
}

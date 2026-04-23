
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col antialiased" style={{ background: '#07090E' }}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}

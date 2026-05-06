
import "./globals.css";
import QueryProvider from "@/providers/QueryProvider";
import type { Metadata } from "next";

export const metadata: Metadata = {
  other: {
    "facebook-domain-verification": "w7icv7iysd2acjgv61jwe0ezzcblfa",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <head>
        <meta name="facebook-domain-verification" content="w7icv7iysd2acjgv61jwe0ezzcblfa" />
      </head>
      <body className="min-h-full flex flex-col antialiased" style={{ background: '#07090E' }}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}

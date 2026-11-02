import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "পাতার ভেতর | AI Bookstore",
  description: "বাংলা বই খুঁজুন, আবিষ্কার করুন, নিজের পাঠ-তালিকা বানান।",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="bn"><body>{children}</body></html>;
}

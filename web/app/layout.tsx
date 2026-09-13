import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies, headers } from "next/headers";
import { LocaleProvider } from "./lib/i18n/LocaleProvider";
import { canadianLocale, LOCALE_COOKIE, resolveLocale, translate } from "./lib/i18n/core";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

async function requestLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get('accept-language'));
}
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return { title: translate(locale, 'metadata.title'), description: translate(locale, 'metadata.description') };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await requestLocale();
  return (
    <html
      lang={canadianLocale(locale)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}

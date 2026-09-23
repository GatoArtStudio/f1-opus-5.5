import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Web Grand Prix — F1 3D",
  description: "Carrera de Fórmula 1 en 3D contra la IA, en el navegador.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0c10",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={titillium.variable}>
      <body>{children}</body>
    </html>
  );
}

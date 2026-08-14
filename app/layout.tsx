import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PennantWatch — Today's MLB Rooting Guide",
  description: "See which MLB teams to cheer for today to help your club's postseason standing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

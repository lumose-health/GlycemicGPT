import type { Metadata } from "next";
import { DesignSystemPage } from "./DesignSystemPage";

export const metadata: Metadata = {
  title: "Design System | GlycemicGPT",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function Page() {
  return <DesignSystemPage />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Design System | Lumose",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function Page() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { DesignSystemPage } = await import("./DesignSystemPage");
  return <DesignSystemPage />;
}

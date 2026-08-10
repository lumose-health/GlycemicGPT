import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lumose",
  icons: {
    icon: [
      {
        url: "/lumose-logo-icon-square.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return children;
}

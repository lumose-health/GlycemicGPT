export type BannerTheme = "default" | "mock";

export interface BannerProps {
  theme?: BannerTheme;
  message?: string;
  className?: string;
}

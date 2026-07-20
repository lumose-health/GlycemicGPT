import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export default function AppearancePage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-12">
      <header className="space-y-2">
        <h1 className="font_poppins font_header_1 text-foreground-primary">
          Appearance
        </h1>
        <p className="font_poppins font_body_2 max-w-2xl text-foreground-secondary">
          Choose how Lumose looks. Your selection applies immediately and is
          saved in this browser.
        </p>
      </header>

      <section aria-labelledby="appearance-theme-heading" className="space-y-6">
        <h2
          className="font_poppins font_header_3 text-foreground-primary"
          id="appearance-theme-heading"
        >
          Theme
        </h2>
        <ThemeSwitcher
          idPrefix="settings-appearance-theme"
          variant="settings"
        />
      </section>
    </div>
  );
}

import { AppShell } from "@/compositions/AppShell";

export default async function AuthenticatedV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isMockRuntimeEnabled = false;

  if (process.env.NODE_ENV === "development") {
    const { getInitialMockRuntimeEnabled } = await import("@/mocks/server");
    isMockRuntimeEnabled = await getInitialMockRuntimeEnabled();
  }

  return (
    <AppShell isMockRuntimeEnabled={isMockRuntimeEnabled}>
      {children}
    </AppShell>
  );
}

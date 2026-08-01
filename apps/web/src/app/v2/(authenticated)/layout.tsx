import { AppShell } from "@/compositions/AppShell";

export default async function AuthenticatedV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isMockRuntimeEnabled = false;
  let notificationsExtension: React.ReactNode = null;

  if (process.env.NODE_ENV === "development") {
    const { getInitialMockRuntimeEnabled } = await import("@/mocks/server");
    isMockRuntimeEnabled = await getInitialMockRuntimeEnabled();

    if (isMockRuntimeEnabled) {
      const { MockNotificationsBridge } =
        await import("@/mocks/MockNotificationsBridge");
      notificationsExtension = <MockNotificationsBridge />;
    }
  }

  return (
    <AppShell
      isMockRuntimeEnabled={isMockRuntimeEnabled}
      notificationsExtension={notificationsExtension}
    >
      {children}
    </AppShell>
  );
}

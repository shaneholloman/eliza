/**
 * My Apps — the standalone view for managing installed elizaOS apps: the running
 * inventory (start/stop/restart), plus the "Create new app" and "Load from
 * directory" entry points. This is the same surface that used to live only as a
 * hidden Settings tab; it now has its own launcher tile so app management is a
 * first-class destination rather than buried in preferences. The body is the
 * reused {@link AppsManagementSection}, wrapped in a titled scroll page.
 */
import { AppsManagementSection } from "../settings/AppsManagementSection";

export function MyAppsView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-txt-strong">My Apps</h1>
        <p className="text-sm text-muted">
          Install, create, and run your elizaOS apps.
        </p>
      </header>
      <AppsManagementSection />
    </div>
  );
}

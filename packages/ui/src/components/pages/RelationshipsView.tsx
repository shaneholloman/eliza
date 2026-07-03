import type { ReactNode } from "react";
import { ViewHeader } from "../shared/ViewHeader";
import { ShellViewAgentSurface } from "../views/ShellViewAgentSurface";
import { RelationshipsWorkspaceView } from "./relationships/RelationshipsWorkspaceView";

/**
 * Relationships — a top-level view (promoted out of the old Character hub).
 * Chromeless "Relationships" header over the relationship-graph workspace.
 */
export function RelationshipsView({
  contentHeader,
}: {
  contentHeader?: ReactNode;
} = {}) {
  return (
    <ShellViewAgentSurface viewId="relationships">
      <div className="flex h-full min-h-0 w-full flex-col">
        <ViewHeader title="Relationships" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <RelationshipsWorkspaceView contentHeader={contentHeader} />
        </div>
      </div>
    </ShellViewAgentSurface>
  );
}

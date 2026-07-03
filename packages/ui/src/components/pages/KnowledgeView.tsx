import { ViewHeader } from "../shared/ViewHeader";
import { ShellViewAgentSurface } from "../views/ShellViewAgentSurface";
import { DocumentsView } from "./DocumentsView";

/**
 * Knowledge — a top-level view (promoted out of the old Character hub, where it
 * was a nested sub-page). Renders the standalone documents manager under a
 * chromeless "Knowledge" header, not inside the character editor chrome.
 */
export function KnowledgeView() {
  return (
    <ShellViewAgentSurface viewId="documents">
      <div className="flex h-full min-h-0 w-full flex-col">
        <ViewHeader title="Knowledge" />
        <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pb-4 sm:px-5 lg:px-6">
          <DocumentsView />
        </div>
      </div>
    </ShellViewAgentSurface>
  );
}

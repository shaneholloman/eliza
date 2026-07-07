/**
 * Side-effect entry point — registers the Focus view for terminal rendering.
 *
 * In a terminal host (the Node agent, no DOM) this registers the unified Focus
 * spatial view so it renders inline in the terminal. Lazy + DOM-guarded so the
 * terminal engine stays out of browser/mobile bundles; on a DOM host this is a
 * no-op (the GUI/XR surface mounts `FocusView` from the view bundle instead).
 */


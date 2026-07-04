import { DEFAULT_SHADER_UNIFORMS, normalizeUniforms, uniformsEqual, } from "../backgrounds/shader-schema";
/** The default shader color — preserves the prior warm-orange home look. */
export const DEFAULT_BACKGROUND_COLOR = "#ef5a1f";
export const DEFAULT_BACKGROUND_CONFIG = {
    mode: "shader",
    color: DEFAULT_BACKGROUND_COLOR,
};
/**
 * The curated default backgrounds. This is the single source of truth shared by
 * the Background view (swatches) and the agent's BACKGROUND action (so "use the
 * green background" maps to the same color the swatch sets). Each preset is a
 * live, breathing shader field — not a flat fill.
 */
export const BACKGROUND_PRESETS = [
    { id: "orange", label: "Orange", color: DEFAULT_BACKGROUND_COLOR },
    { id: "amber", label: "Amber", color: "#f59e0b" },
    { id: "rose", label: "Rose", color: "#e11d48" },
    { id: "red", label: "Red", color: "#dc2626" },
    { id: "green", label: "Green", color: "#059669" },
    { id: "olive", label: "Olive", color: "#65a30d" },
    { id: "stone", label: "Stone", color: "#57534e" },
    { id: "graphite", label: "Graphite", color: "#3f3f46" },
    { id: "black", label: "Black", color: "#0a0a0a" },
    { id: "light", label: "Light", color: "#f4f4f5" },
];
/** Structural equality for two background configs (skips history no-ops). */
export function backgroundConfigsEqual(a, b) {
    return (a.mode === b.mode &&
        a.color === b.color &&
        (a.imageUrl ?? "") === (b.imageUrl ?? "") &&
        shaderConfigsEqual(a.shader, b.shader));
}
function shaderConfigsEqual(a, b) {
    if (!a && !b)
        return true;
    if (!a || !b)
        return false;
    return (a.source === b.source &&
        (a.presetId ?? "") === (b.presetId ?? "") &&
        uniformsEqual(a.uniforms, b.uniforms));
}
/* ── Accent color presets ─────────────────────────────────────────────── */
/**
 * The default accent id — keeps the app's built-in brand accent (orange) by
 * applying no `--accent` override, so base.css / the host brand theme wins.
 */
export const DEFAULT_ACCENT_ID = "default";
/**
 * The curated accent choices. Single source of truth shared by the Appearance
 * settings swatches and the first-run onboarding accent step, so both drive the
 * exact same persisted preference.
 */
export const ACCENT_PRESETS = [
    { id: "default", label: "Eliza Orange", color: null, swatch: "🟠" },
    { id: "amber", label: "Amber", color: "#f59e0b", swatch: "🟡" },
    { id: "rose", label: "Rose", color: "#e11d48", swatch: "🌹" },
    { id: "red", label: "Red", color: "#dc2626", swatch: "🔴" },
    { id: "green", label: "Green", color: "#059669", swatch: "🟢" },
    { id: "olive", label: "Olive", color: "#65a30d", swatch: "🫒" },
];
/** Coerce an unknown persisted value to a valid accent id (default fallback). */
export function normalizeAccentId(value) {
    return typeof value === "string" && ACCENT_PRESETS.some((p) => p.id === value)
        ? value
        : DEFAULT_ACCENT_ID;
}
/**
 * Resolve an accent id to its hex color, or `null` for the built-in brand
 * accent (the `default` preset, or any unknown id).
 */
export function resolveAccentColor(id) {
    return ACCENT_PRESETS.find((p) => p.id === id)?.color ?? null;
}
/** Build a normalized glsl `BackgroundConfig` from a shader source + partials.
 * `uniforms` accepts unknown-valued partials (agent/persisted input);
 * `normalizeUniforms` clamps + coerces them to finite numbers. */
export function makeGlslConfig(args) {
    return {
        mode: "glsl",
        color: args.color ?? DEFAULT_BACKGROUND_COLOR,
        shader: {
            presetId: args.presetId,
            source: args.source,
            uniforms: normalizeUniforms({
                ...DEFAULT_SHADER_UNIFORMS,
                ...(args.uniforms ?? {}),
            }),
        },
    };
}

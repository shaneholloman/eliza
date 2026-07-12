/**
 * Constructs browser audio primitives behind runtime validators so embedded
 * WebViews can expose vendor-prefixed or partial APIs without weakening the
 * typed voice pipeline.
 */

export type RuntimeValidator<T> = (value: unknown) => value is T;

function browserAudioContextConstructor(): unknown {
  if (typeof window === "undefined") return undefined;
  return (
    Reflect.get(window, "AudioContext") ??
    Reflect.get(window, "webkitAudioContext")
  );
}

export function constructBrowserAudioContext<T>(
  args: readonly unknown[],
  validate: RuntimeValidator<T>,
): T | null {
  const ctor = browserAudioContextConstructor();
  if (typeof ctor !== "function") return null;
  const context: unknown = Reflect.construct(ctor, Array.from(args));
  return validate(context) ? context : null;
}

export function constructBrowserAudioWorkletNode<T>(
  context: object,
  name: string,
  validate: RuntimeValidator<T>,
): T | null {
  const ctor: unknown = globalThis.AudioWorkletNode;
  if (typeof ctor !== "function") return null;
  const node: unknown = Reflect.construct(ctor, [context, name]);
  return validate(node) ? node : null;
}

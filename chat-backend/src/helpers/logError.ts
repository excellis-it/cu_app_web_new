type LogMeta = Record<string, unknown>;

export default function logError(error: unknown, meta: LogMeta = {}) {
  // Keep this helper intentionally simple: it prevents crashes when optional
  // error details are missing and gives consistent logs.
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as any).message)
      : "Unknown error";

  // eslint-disable-next-line no-console
  console.error("[logError]", { message, error, ...meta });
}


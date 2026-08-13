export interface OutputFormatter {
  format(data: unknown): string;
}

export class TextFormatter implements OutputFormatter {
  format(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }
    return JSON.stringify(data, null, 2);
  }
}

export class JSONFormatter implements OutputFormatter {
  format(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }
}

export class CompactJSONFormatter implements OutputFormatter {
  format(data: unknown): string {
    return JSON.stringify(data);
  }
}

export function getFormatter(format: "text" | "json" | "compact"): OutputFormatter {
  switch (format) {
    case "json":
      return new JSONFormatter();
    case "compact":
      return new CompactJSONFormatter();
    case "text":
    default:
      return new TextFormatter();
  }
}

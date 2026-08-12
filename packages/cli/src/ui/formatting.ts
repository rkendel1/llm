export const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function colored(text: string, color: string): string {
  return `${color}${text}${colors.reset}`;
}

export function bold(text: string): string {
  return colored(text, colors.bright);
}

export function dim(text: string): string {
  return colored(text, colors.dim);
}

export function error(text: string): string {
  return colored(text, colors.red);
}

export function success(text: string): string {
  return colored(text, colors.green);
}

export function warning(text: string): string {
  return colored(text, colors.yellow);
}

export function info(text: string): string {
  return colored(text, colors.cyan);
}

export function table(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map((row) => row[i]?.length || 0));
    return Math.max(h.length, maxRowWidth);
  });

  const headerRow = headers
    .map((h, i) => h.padEnd(colWidths[i]!))
    .join("  ");
  const separator = colWidths.map((w) => "─".repeat(w)).join("──");

  const bodyRows = rows
    .map((row) => row.map((cell, i) => cell.padEnd(colWidths[i]!)).join("  "))
    .join("\n");

  return [headerRow, separator, bodyRows].join("\n");
}

export function section(title: string): string {
  return `\n${bold(title)}\n${dim("─".repeat(title.length))}\n`;
}

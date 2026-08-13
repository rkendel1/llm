import readline from "node:readline";

export function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function prompt(question: string, rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

export async function promptPassword(
  question: string,
  rl: readline.Interface
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(new Error("Password entry requires an interactive terminal"));
      return;
    }

    rl.pause();
    process.stdout.write(question);

    let password = "";
    const wasRaw = stdin.isRaw;
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (!wasRaw) stdin.setRawMode(false);
      rl.resume();
    };

    const onData = (chunk: string | Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          cleanup();
          process.stdout.write("\n");
          resolve(password);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Setup cancelled"));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (char >= " ") {
          password += char;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
    stdin.resume();
  });
}

export async function promptConfirm(
  question: string,
  existingInterface?: readline.Interface
): Promise<boolean> {
  const rl = existingInterface || createInterface();
  const answer = await prompt(`${question} (y/n) `, rl);
  if (!existingInterface) rl.close();
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

export async function selectOption(
  question: string,
  options: string[]
): Promise<string> {
  const rl = createInterface();
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt}`);
  });

  let selected = -1;
  while (selected < 0 || selected >= options.length) {
    const answer = await prompt("Select an option (number): ", rl);
    const index = parseInt(answer) - 1;
    if (index >= 0 && index < options.length) {
      selected = index;
    } else {
      console.log("Invalid selection");
    }
  }

  rl.close();
  return options[selected]!;
}

export function close(rl: readline.Interface): void {
  rl.close();
}

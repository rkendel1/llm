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
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.pause();

    // Use process.stdout directly to write the question
    process.stdout.write(question);

    let password = "";
    stdin.setEncoding("utf8");

    stdin.on("data", (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        // End of line
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(password);
      } else if (char === "\u0003") {
        // Ctrl+C
        process.exit();
      } else if (char === "\u007F") {
        // Backspace
        password = password.slice(0, -1);
      } else {
        password += char;
      }
    });
  });
}

export async function promptConfirm(question: string): Promise<boolean> {
  const rl = createInterface();
  const answer = await prompt(`${question} (y/n) `, rl);
  rl.close();
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


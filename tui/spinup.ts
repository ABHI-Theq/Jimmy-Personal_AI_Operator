import { select, isCancel } from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import { runCLIMode } from "../CLI/cli";
import { runTelegramMode } from "../Telegram";

const HF = "ANSI Shadow";
const SHADOW = chalk.hex("#5941de");
const FACE = chalk.hex("#eeeffff").bold;

function printBannerWithShadow(ascii: string) {
  const bannerLines = ascii.replace(/\s+$/, "").split("\n");
  const maxLen = Math.max(...bannerLines.map((l) => l.length), 0);
  const rowWidth = maxLen + 2;

  for (const line of bannerLines) {
    console.log(SHADOW(("  " + line).padEnd(rowWidth)));
  }
  process.stdout.write(`\x1b[${bannerLines.length}A`);
  for (const line of bannerLines) {
    console.log(FACE(line.padEnd(rowWidth)));
  }
  console.log();
}

export const startArena = async () => {
  let ascii: string;

  try {
    ascii = figlet.textSync("Jimmy", { font: HF });
  } catch (e) {
    ascii = figlet.textSync("Jimmy", { font: "Standard" });
  }

  printBannerWithShadow(ascii);

  while (true) {
    const option = await select({
      message: chalk.green("choose way to communicate"),
      options: [
        { value: "CLI", label: "CLI" },
        { value: "Telegram", label: "Telegram" },
        { value: "Exit", label: "Exit" },
      ],
    });

    if (isCancel(option) || option == "Exit") {
      console.log(chalk.green.bold("Goodbye !!!"));
      return "END";
    }
    if (option == "CLI") {
      await runCLIMode();
      continue;
    } else if (option == "Telegram") {
      await runTelegramMode()
      continue;
    }
  }
};

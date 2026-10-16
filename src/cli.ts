#!/usr/bin/env node
import { hookCommand } from "./hook";
import {
  listCommand,
  diffCommand,
  restoreCommand,
  gcCommand,
} from "./commands";
import { installCommand, uninstallCommand } from "./install";

const VERSION = "0.1.1";

function usage(): void {
  console.log(`rewindex ${VERSION} — git-free /undo for OpenAI Codex CLI

Usage:
  rewindex install            Add snapshot hooks and the $rewindex Codex skill
  rewindex uninstall          Remove rewindex hooks and skill (leaves yours alone)
  rewindex list               List snapshots (grouped by turn, with prompt + files changed)
  rewindex diff <number|id>   Show what restoring that prompt would change
  rewindex restore <number|id> Restore that prompt baseline (preview + confirm)
  rewindex restore --undo     Undo the last restore (via its safety snapshot)
  rewindex gc                 Prune old snapshots (default: 7 days / 500 MB)
  rewindex hook               (internal) read a hook payload on stdin and snapshot

Inside Codex after install:
  $rewindex list
  $rewindex diff <number|id>
  $rewindex restore <number|id>
  $rewindex undo

Options:
  -y, --yes                   Skip the restore confirmation prompt
  -C, --cwd <dir>             Operate on <dir> instead of the current directory
  -h, --help                  Show this help
  -v, --version               Show version
`);
}

interface ParsedArgs {
  cmd?: string;
  positionals: string[];
  yes: boolean;
  undo: boolean;
  cwd: string;
}

function parse(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    positionals: [],
    yes: false,
    undo: false,
    cwd: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-y" || a === "--yes") out.yes = true;
    else if (a === "--undo") out.undo = true;
    else if (a === "-C" || a === "--cwd") out.cwd = argv[++i] ?? out.cwd;
    else if (!out.cmd && !a.startsWith("-")) out.cmd = a;
    else if (!a.startsWith("-")) out.positionals.push(a);
    else out.positionals.push(a); // keep unknown flags as positionals for help
  }
  return out;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    usage();
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    console.log(VERSION);
    return 0;
  }

  const args = parse(argv);
  switch (args.cmd) {
    case "hook":
      return hookCommand();
    case "install":
      return installCommand();
    case "uninstall":
      return uninstallCommand();
    case "list":
    case "ls":
      return listCommand(args.cwd);
    case "diff":
      return diffCommand(args.cwd, args.positionals[0]);
    case "restore":
      return restoreCommand(args.cwd, args.positionals[0], {
        yes: args.yes,
        undo: args.undo,
      });
    case "gc":
      return gcCommand(args.cwd);
    default:
      console.error(`Unknown command: ${args.cmd}\n`);
      usage();
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`rewindex: ${err?.message ?? err}`);
    process.exit(1);
  });

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .scriptName("druck")
  .usage("$0 <command> [options]")
  .demandCommand(1, "Specify a subcommand.")
  .strict()
  .help()
  .parse();

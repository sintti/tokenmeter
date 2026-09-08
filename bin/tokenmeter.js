#!/usr/bin/env node
import { main } from '../src/index.js';

main(process.argv.slice(2)).catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

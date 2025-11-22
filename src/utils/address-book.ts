import * as fs from 'fs';
import * as path from 'path';

const ADDRESS_CANDIDATES = [
  path.join(process.cwd(), 'addresses.json'),
  path.join(process.cwd(), 'src', 'deployed-addresses.json'),
];

/**
 * Load deployed contract addresses from the standard address book file.
 * Falls back to legacy `deployed-addresses.json` if needed.
 */
export function loadAddresses(): any {
  for (const candidate of ADDRESS_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
    }
  }

  throw new Error('addresses.json not found! Run `npm run deploy:all` first.');
}


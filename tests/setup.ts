import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file for tests
config({ path: resolve(process.cwd(), '.env') });

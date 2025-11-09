import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PORT = 8080;
export const EUFY_WS_PORT = 3000;
export const EUFY_WS_HOST = 'localhost';

export const DATABASE_DIR = join(__dirname, '..', '..', 'database');
export const CSV_FILE_PATH = join(DATABASE_DIR, 'camera_transitions.csv');
export const SETTINGS_FILE_PATH = join(DATABASE_DIR, 'settings.csv');
export const CONFIG_FILE_PATH = join(__dirname, '..', '..', 'config.json');

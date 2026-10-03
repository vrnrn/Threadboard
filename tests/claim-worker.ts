import { Store } from '../src/store.js';
import { freshClaim } from '../src/api.js';
import { BoardError } from '../src/types.js';
const input = JSON.parse(process.env.THREADBOARD_RACE_INPUT!);
const store = new Store(input.directory);
try { store.claim({ ...input, ...freshClaim(), owner: 'Concurrent chat' }); console.log(JSON.stringify({ ok: true })); }
catch (error) { if (!(error instanceof BoardError)) throw error; console.log(JSON.stringify({ ok: false, code: error.code })); }
finally { store.close(); }

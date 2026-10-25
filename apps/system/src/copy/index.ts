import keys from "./keys.json";
import en from "./en.json";

export type Copy = typeof keys;

// Both files must share one nested key schema; a drift fails typecheck here.
const _schemaCheck: Copy = en;
const _valueCheck: typeof en = keys;
void _schemaCheck;
void _valueCheck;

export const copy: Copy = en;

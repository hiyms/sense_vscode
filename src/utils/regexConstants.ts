/** @file 正则表达式和字符串处理常量 */

export const DATE_TIME_REGEX: RegExp =
    /^(\d{4}-\d{2}-\d{2})?[T\s]?(?:(\d{2}):\d{2}:\d{2}(?:\.\d+)?)?(Z|[-+]\d{2}:\d{2})?$/i;
export const INT_REGEX: RegExp = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
export const FLOAT_REGEX: RegExp = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
export const LEADING_ZERO_REGEX: RegExp = /^[+-]?0[0-9_]/;
export const ESCAPE_REGEX: RegExp = /^[0-9a-f]{4,8}$/i;
export const KEY_REGEX: RegExp = /^[a-z0-9-_]+$/i;
export const LINE_SPLITTER_REGEX: RegExp = /\r\n|\n|\r/g;
export const KEY_PART_REGEX: RegExp = /^[a-zA-Z0-9-_]+[\s\t]*$/;

export const DATE_HOURS_INDEX: number = 2;
export const DATE_MAX_HOURS: number = 23;
export const DATE_OFFSET_INDEX: number = 3;
export const DATE_END_INDEX: number = 10;
export const TIME_START_INDEX: number = 11;
export const TIME_END_INDEX: number = 23;
export const HOUR_MINUTES_SECONDS: number = 60;
export const MILL_SECONDS: number = 1000;
export const MINUTE_START_INDEX: number = 4;
export const MINUTE_END_INDEX: number = 6;
export const TWO_POS_OFFSET: number = 2;
export const LOWER_CHARACTER_LENGTH: number = 4;
export const UPPER_CHARACTER_LENGTH: number = 8;

export const ESCAPE_SYMBOL_MAP: Record<string, string> = {
    b: "\b",
    t: "\t",
    n: "\n",
    f: "\f",
    r: "\r",
    '"': '"',
    "\\": "\\",
};

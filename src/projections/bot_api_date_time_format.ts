import type { DateTimeFormat, DateTimePartPrecision } from '../types/virtual_message.ts';

/** The letters of Bot API date and time formats that choose each part's precision. */
const DATE_PRECISION_LETTERS: Readonly<Record<DateTimePartPrecision, string>> = {
  short: 'd',
  long: 'D',
};
const TIME_PRECISION_LETTERS: Readonly<Record<DateTimePartPrecision, string>> = {
  short: 't',
  long: 'T',
};

/**
 * Writes a date and time format as the official Bot API server's `get_date_time_format` does:
 * `r` for relative time, otherwise `w` for the day of the week, then `d` or `D` for the date and
 * `t` or `T` for the time, each shown in that order; empty for no format.
 */
export function writeDateTimeFormat(format: DateTimeFormat | undefined): string {
  if (format === undefined) {
    return '';
  }
  if (format.kind === 'relative') {
    return 'r';
  }
  const { showsDayOfWeek, datePrecision, timePrecision } = format;
  return [
    showsDayOfWeek ? 'w' : '',
    datePrecision === undefined ? '' : DATE_PRECISION_LETTERS[datePrecision],
    timePrecision === undefined ? '' : TIME_PRECISION_LETTERS[timePrecision],
  ].join('');
}

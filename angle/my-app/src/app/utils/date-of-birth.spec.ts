import { calculateAge, MAX_AGE_YEARS } from './date-of-birth';

// A date this many years before today, shifted by some days,
// written the way a date input gives it (YYYY-MM-DD).
function yearsAgo(years: number, plusDays = 0): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + plusDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// calculateAge decides whether a user meets a group's age limit.
// The server applies the same rule.
describe('calculateAge', () => {
  it('gives the age in whole years', () => {
    expect(calculateAge(yearsAgo(30, -40))).toBe(30);
  });

  it('counts a birthday that is today', () => {
    expect(calculateAge(yearsAgo(18))).toBe(18);
  });

  it('does not count a birthday that is tomorrow', () => {
    expect(calculateAge(yearsAgo(18, 1))).toBe(17);
  });

  it('gives 0 for someone born today', () => {
    expect(calculateAge(yearsAgo(0))).toBe(0);
  });

  it('gives null for a missing date', () => {
    expect(calculateAge(undefined)).toBeNull();
    expect(calculateAge('')).toBeNull();
  });

  it('gives null for a date that is not a real calendar date', () => {
    expect(calculateAge('2023-02-29')).toBeNull();
    expect(calculateAge('2001-04-31')).toBeNull();
    expect(calculateAge('2000-13-01')).toBeNull();
  });

  it('accepts the 29th of February in a leap year', () => {
    expect(calculateAge('2000-02-29')).not.toBeNull();
  });

  it('gives null for the wrong format', () => {
    expect(calculateAge('12/02/2000')).toBeNull();
    expect(calculateAge('yesterday')).toBeNull();
  });

  it('gives null for a date in the future', () => {
    expect(calculateAge(yearsAgo(0, 1))).toBeNull();
  });

  it('gives null for a date too long ago to be real, such as year 0112', () => {
    expect(calculateAge('0112-02-12')).toBeNull();
    expect(calculateAge(yearsAgo(MAX_AGE_YEARS + 1))).toBeNull();
  });
});

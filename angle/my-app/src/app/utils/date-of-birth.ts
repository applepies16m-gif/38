// Date-of-birth helpers shared by the pages that need a user's
// age. They follow the same rules as the server (server.js), which
// has the final say; these only let a page explain a refusal
// before the request is sent.

// A date of birth further back than this is treated as a mistake.
export const MAX_AGE_YEARS = 120;

// Shown when a date of birth fails calculateAge's rules.
export const INVALID_DATE_OF_BIRTH_MESSAGE =
  'Date of birth must be a real date, not in the future and not more than 120 years ago.';

// Returns the age in whole years today, or null if the date of
// birth is missing, not a real calendar date written as
// YYYY-MM-DD, in the future, or more than MAX_AGE_YEARS ago.
export function calculateAge(dateOfBirth: string | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth || '');
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // A date that doesn't exist rolls over when built (2023-02-29
  // becomes 1 March), so if the parts read back differently the
  // date was never real.
  const built = new Date(Date.UTC(year, month - 1, day));
  if (
    built.getUTCFullYear() !== year ||
    built.getUTCMonth() !== month - 1 ||
    built.getUTCDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  const thisMonth = today.getMonth() + 1;
  const birthdayPassed = thisMonth > month || (thisMonth === month && today.getDate() >= day);

  let age = today.getFullYear() - year;
  if (!birthdayPassed) {
    age = age - 1;
  }
  if (age < 0 || age > MAX_AGE_YEARS) {
    return null;
  }
  return age;
}

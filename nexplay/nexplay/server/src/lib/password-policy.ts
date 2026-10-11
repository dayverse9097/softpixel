/** Returns a list of problems. An empty list means the password is acceptable. Length matters most. */
export function passwordProblems(password: string, email = ''): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push('Use at least 12 characters.');
  if (password.length > 128) problems.push('Use 128 characters or fewer.');
  if (/^\d+$/.test(password)) problems.push('Do not use only digits.');
  if (password.length > 0 && new Set(password).size < 5) problems.push('Use a wider mix of characters.');
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && password.toLowerCase().includes(local)) problems.push('Do not include your email name.');
  return problems;
}

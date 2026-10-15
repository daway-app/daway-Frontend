/**
 * Shared logo-file validation for the pharmacy profile screens.
 *
 * Mirrors the backend rule (`image|mimes:jpeg,png,jpg,webp|max:2048` on
 * `logo_file`): the check runs locally FIRST so an invalid pick fails with
 * an Arabic message before any network request. Callers map the returned
 * code to `STR.pharmacy.profile.logo_{type,size}_error`.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type LogoFileError = 'type' | 'size' | null;

export function validateLogoFile(file: File): LogoFileError {
  if (!LOGO_MIME.has(file.type.toLowerCase())) return 'type';
  if (file.size > LOGO_MAX_BYTES) return 'size';
  return null;
}

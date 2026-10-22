/**
 * Shared image-file validation for pickers that upload straight to the API.
 *
 * Mirrors the backend rule (`image|mimes:jpeg,png,jpg,webp|max:2048` for
 * pharmacy logos and medicine images): the check runs locally FIRST so an
 * invalid pick fails with an Arabic message before any network request.
 * Callers map the returned code to their own translated message.
 */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ImageFileError = 'type' | 'size' | null;

export function validateImageFile(file: File): ImageFileError {
  if (!IMAGE_MIME.has(file.type.toLowerCase())) return 'type';
  if (file.size > IMAGE_MAX_BYTES) return 'size';
  return null;
}

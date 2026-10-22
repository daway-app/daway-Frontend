/**
 * Logo-file validation for the pharmacy profile screens.
 *
 * The actual checks live in `src/lib/imageFile.ts` so medicine images and
 * logos share one rule. Keep this module as the profile-facing alias because
 * the profile screens and their messages use `logo_file` naming.
 */
import {
  IMAGE_MAX_BYTES,
  validateImageFile,
  type ImageFileError,
} from '@/lib/imageFile';

export const LOGO_MAX_BYTES = IMAGE_MAX_BYTES;
export type LogoFileError = ImageFileError;
export const validateLogoFile = validateImageFile;

/** Save only after the authenticated download has completed successfully. */
export async function downloadAndSave(download: Promise<Blob>, filename: string): Promise<void> {
  const blob = await download;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'receipt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

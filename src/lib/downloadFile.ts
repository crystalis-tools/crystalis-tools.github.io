/** Trigger a browser download of in-memory bytes. */
export function downloadFile(name: string, data: Uint8Array) {
  const blob = new Blob([data] as BlobPart[], {type: 'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

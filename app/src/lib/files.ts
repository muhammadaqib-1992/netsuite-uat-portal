import type { Attachment, FileData } from '../types';

export function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

/** Turns a picked or pasted image into an upload, or explains why it can't be attached. */
export async function toAttachment(file: File, maxBytes: number): Promise<Attachment> {
  const ext = IMAGE_EXT[file.type];
  if (!ext) throw new Error('Only PNG, JPG and GIF screenshots can be attached.');
  if (file.size > maxBytes) throw new Error(`Screenshots must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
  const name = file.name && file.name !== 'image.png' ? file.name : `screenshot-${Date.now()}.${ext}`;
  return { name: /\.(png|jpe?g|gif)$/i.test(name) ? name : `${name}.${ext}`, base64: await readAsBase64(file) };
}

export function dataUrl(f: FileData): string {
  return `data:${f.mime};base64,${f.base64}`;
}

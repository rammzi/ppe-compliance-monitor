import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ROBOFLOW_CONFIG = {
  apiKey: import.meta.env.VITE_ROBOFLOW_API_KEY || 'D5OaxRCZhHUoYTSoObK7', // Fallback for demo if env not set, though ideally should be env only
  modelId: import.meta.env.VITE_ROBOFLOW_MODEL_ID || 'construction-ppe-detection/1',
  baseUrl: import.meta.env.VITE_ROBOFLOW_BASE_URL || 'https://serverless.roboflow.com',
};

export const resizeImage = (base64Str: string, maxWidth = 640, maxHeight = 640): Promise<{ base64: string; width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve({
        base64: canvas.toDataURL('image/jpeg', 0.7),
        width,
        height
      });
    };
  });
};

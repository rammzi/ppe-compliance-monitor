import axios from 'axios';
import { resizeImage } from '@/lib/utils';
// We no longer import ROBOFLOW_CONFIG here because the frontend doesn't need to know the keys!

export interface Prediction {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
  color?: string;
}

export interface InferenceResult {
  predictions: Prediction[];
  image?: {
    width: number;
    height: number;
  };
}

export const runInference = async (
  imageBase64: string,
  confidence: number,
  overlap: number
): Promise<InferenceResult> => {
  
  // 1. Resize image to max 640x640 to prevent 413 Payload Too Large errors
  const { base64: resizedBase64, width: inferenceWidth, height: inferenceHeight } = await resizeImage(imageBase64);

  // 2. Remove data URL prefix if present
  const base64Data = resizedBase64.replace(/^data:image\/\w+;base64,/, "");

  try {
    // ─── THE SECURE PROXY CALL ─────────────────────────────────────────
    // Instead of calling Roboflow directly, we call our own backend.
    // Our backend (/api/inference) will safely attach the hidden .env API key.
    const response = await axios.post('/api/inference', {
      imageBase64: base64Data,
      confidence: confidence,
      overlap: overlap
    });

    return {
      ...response.data,
      image: {
        width: inferenceWidth,
        height: inferenceHeight
      }
    };
  } catch (error) {
    console.error("Local Inference Proxy Error:", error);
    throw error;
  }
};
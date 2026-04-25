import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import Webcam from 'react-webcam';
import { runInference, type Prediction } from '@/services/roboflow';
import { AlertTriangle, Camera, Upload, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CameraFeedHandle {
  captureFrame: () => string | null;
}

interface CameraFeedProps {
  isLive: boolean;
  uploadedImage: string | null;
  analysisTrigger: number;
  confidenceThreshold: number;
  overlapThreshold: number;
  onPredictions: (predictions: Prediction[]) => void;
  onStatusChange: (status: 'idle' | 'detecting' | 'error') => void;
}

// Common class mapping for construction models if they return indices
const CLASS_MAP: Record<string, string> = {
  '0': 'Hard Hat',
  '1': 'Safety Vest',
  '2': 'Mask',
  '3': 'Gloves',
  '4': 'Boots',
  '5': 'Person',
  '6': 'Ear Protection',
  '7': 'Safety Glasses',
  '8': 'Machinery',
  '9': 'Vehicle'
};

export const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(({
  isLive,
  uploadedImage,
  analysisTrigger,
  confidenceThreshold,
  overlapThreshold,
  onPredictions,
  onStatusChange,
}, ref) => {
  const webcamRef = useRef<Webcam>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [lastResult, setLastResult] = useState<{ predictions: Prediction[], width: number, height: number } | null>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: (): string | null => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container) return null;
      const out = document.createElement('canvas');
      out.width = container.clientWidth;
      out.height = container.clientHeight;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      if (isLive && webcamRef.current?.video) {
        ctx.drawImage(webcamRef.current.video, 0, 0, out.width, out.height);
      } else if (!isLive && imgRef.current) {
        ctx.drawImage(imgRef.current, 0, 0, out.width, out.height);
      }
      if (canvas) ctx.drawImage(canvas, 0, 0);
      return out.toDataURL('image/jpeg', 0.85);
    },
  }));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper to get the display dimensions of the media (video or image)
  // taking "object-contain" into account
  const getDisplayDimensions = (
    containerWidth: number, 
    containerHeight: number, 
    mediaWidth: number, 
    mediaHeight: number
  ) => {
    const containerRatio = containerWidth / containerHeight;
    const mediaRatio = mediaWidth / mediaHeight;

    let displayWidth, displayHeight, offsetX, offsetY;

    if (mediaRatio > containerRatio) {
      // Media is wider than container (constrained by width)
      displayWidth = containerWidth;
      displayHeight = containerWidth / mediaRatio;
      offsetX = 0;
      offsetY = (containerHeight - displayHeight) / 2;
    } else {
      // Media is taller than container (constrained by height)
      displayHeight = containerHeight;
      displayWidth = containerHeight * mediaRatio;
      offsetX = (containerWidth - displayWidth) / 2;
      offsetY = 0;
    }

    return { displayWidth, displayHeight, offsetX, offsetY };
  };

  // Draw bounding boxes
  const drawPredictions = useCallback((predictions: Prediction[], inferenceWidth: number, inferenceHeight: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    // Determine the source media dimensions (Video or Image)
    let mediaWidth = 0;
    let mediaHeight = 0;

    if (isLive && webcamRef.current?.video) {
       mediaWidth = webcamRef.current.video.videoWidth;
       mediaHeight = webcamRef.current.video.videoHeight;
    } else if (!isLive && imgRef.current) {
       mediaWidth = imgRef.current.naturalWidth;
       mediaHeight = imgRef.current.naturalHeight;
    }

    if (!canvas || !container || mediaWidth === 0 || mediaHeight === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to full container size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate how the media is displayed within the container (object-contain)
    const { displayWidth, displayHeight, offsetX, offsetY } = getDisplayDimensions(
      canvas.width,
      canvas.height,
      mediaWidth,
      mediaHeight
    );

    // Calculate scale factors from INFERENCE dimensions to DISPLAY dimensions
    // The inference might have been on a resized image (e.g. 640x640), but we are displaying it at displayWidth x displayHeight
    const scaleX = displayWidth / inferenceWidth;
    const scaleY = displayHeight / inferenceHeight;

    predictions.forEach((pred) => {
      // Roboflow returns center x,y. Convert to top-left.
      // Then scale to display size.
      // Then add offset (letterboxing).
      const x = (pred.x - pred.width / 2) * scaleX + offsetX;
      const y = (pred.y - pred.height / 2) * scaleY + offsetY;
      const w = pred.width * scaleX;
      const h = pred.height * scaleY;

      // Determine color based on class
      let color = '#FFB300'; // Default Warning/Yellow
      const lowerClass = pred.class.toLowerCase();
      
      if (['helmet', 'vest', 'gloves', 'boots', 'ear_protection', 'mask', 'hard hat', 'safety vest'].some(c => lowerClass.includes(c)) && !lowerClass.includes('no-')) {
        color = '#00E676'; // Safe/Green
      } else if (['no-', 'person'].some(c => lowerClass.includes(c))) {
         if (lowerClass === 'person' || lowerClass === '5') color = '#2E3136'; // Neutral for person
         else color = '#FF5252'; // Danger/Red for violations
      }

      // Draw Box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Draw Label Background
      ctx.fillStyle = color;
      
      // Map class name if it's an index
      const className = CLASS_MAP[pred.class] || pred.class;
      const text = `${className} ${Math.round(pred.confidence * 100)}%`;
      
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(text);
      const textHeight = 16; // Approx height
      const padding = 4;
      const labelHeight = textHeight + padding * 2;
      
      // Ensure label doesn't go off screen at the top
      // If the box is too close to the top (y < labelHeight), draw label below the box
      let labelY = y - labelHeight;
      if (labelY < 0) {
        labelY = y + h;
      }

      ctx.fillRect(x, labelY, textMetrics.width + padding * 2, labelHeight);

      // Draw Label Text with Outline/Shadow for contrast
      ctx.textBaseline = 'top';
      
      // Outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(text, x + padding, labelY + padding + 1); // +1 for visual alignment
      
      // Fill
      ctx.fillStyle = '#000000';
      ctx.fillText(text, x + padding, labelY + padding + 1);
    });
  }, [isLive]);

  // Re-draw when container resizes
  useEffect(() => {
    const handleResize = () => {
      if (lastResult) {
        drawPredictions(lastResult.predictions, lastResult.width, lastResult.height);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [lastResult, drawPredictions]);

  // Live Detection Loop
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isLive) {
      intervalId = setInterval(async () => {
        if (webcamRef.current && webcamRef.current.video?.readyState === 4) {
          const video = webcamRef.current.video;
          const screenshot = webcamRef.current.getScreenshot();
          
          if (screenshot) {
            onStatusChange('detecting');
            try {
              const result = await runInference(screenshot, confidenceThreshold, overlapThreshold);
              onPredictions(result.predictions);
              
              if (result.image) {
                setLastResult({ predictions: result.predictions, width: result.image.width, height: result.image.height });
                drawPredictions(result.predictions, result.image.width, result.image.height);
              }
              onStatusChange('idle');
            } catch (e) {
              console.error(e);
              onStatusChange('error');
            }
          }
        }
      }, 1000); // 1 FPS
    }

    return () => clearInterval(intervalId);
  }, [isLive, confidenceThreshold, overlapThreshold, onPredictions, onStatusChange, drawPredictions]);

  // Static Image Detection Function
  const runStaticDetection = useCallback(async () => {
    if (!uploadedImage) return;
    
    onStatusChange('detecting');
    setErrorMsg(null);
    try {
      const result = await runInference(uploadedImage, confidenceThreshold, overlapThreshold);
      onPredictions(result.predictions);

      if (result.image) {
        setLastResult({ predictions: result.predictions, width: result.image.width, height: result.image.height });
        drawPredictions(result.predictions, result.image.width, result.image.height);
      }
      onStatusChange('idle');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || String(e);
      setErrorMsg(msg);
      onStatusChange('error');
    }
  }, [uploadedImage, confidenceThreshold, overlapThreshold, onPredictions, onStatusChange, drawPredictions]);

  // Auto-run static detection when sliders change (debounced)
  useEffect(() => {
    if (!isLive && uploadedImage) {
      const timer = setTimeout(() => {
        runStaticDetection();
      }, 300); // 300ms debounce
      return () => clearTimeout(timer);
    }
  }, [confidenceThreshold, overlapThreshold, isLive, uploadedImage, runStaticDetection]);

  // React to external analysis trigger
  useEffect(() => {
    if (analysisTrigger > 0 && !isLive && uploadedImage) {
      runStaticDetection();
    }
  }, [analysisTrigger, isLive, uploadedImage, runStaticDetection]);

  return (
    <div className="flex flex-col w-full h-full gap-2">
      <div className="relative flex-1 min-h-0 bg-black rounded-lg overflow-hidden border border-white/10 shadow-inner flex items-center justify-center" ref={containerRef}>
        {isLive ? (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            className="w-full h-full object-contain"
            disablePictureInPicture={false}
            forceScreenshotSourceSize={false}
            imageSmoothing={true}
            mirrored={false}
            minScreenshotHeight={undefined}
            minScreenshotWidth={undefined}
            screenshotQuality={0.92}
            videoConstraints={{ facingMode: "user" }}
            onUserMedia={() => {}}
            onUserMediaError={() => {}}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1A1C1E]">
            {uploadedImage ? (
              <img 
                ref={imgRef}
                src={uploadedImage} 
                alt="Uploaded" 
                className="max-w-full max-h-full object-contain"
                onLoad={() => {
                   // Initial run when image loads
                   runStaticDetection();
                }}
              />
            ) : (
              <div className="text-center p-10 border-2 border-dashed border-white/20 rounded-xl">
                <Upload className="w-12 h-12 text-white/40 mx-auto mb-4" />
                <p className="text-white/60">Upload an image to analyze</p>
              </div>
            )}
          </div>
        )}

        {/* Overlay Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute bottom-3 left-3 right-3 z-20 bg-red-600 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span><strong>Detection failed:</strong> {errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
});

CameraFeed.displayName = 'CameraFeed';

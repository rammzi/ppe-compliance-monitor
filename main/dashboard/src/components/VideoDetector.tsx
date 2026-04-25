import React, { useRef, useState, useEffect } from 'react';
import { runInference } from '../services/roboflow';

interface VideoDetectorProps {
  videoUrl: string;
  confidenceThreshold: number;
  overlapThreshold: number;
  onPredictions: (predictions: any[]) => void;
}

export default function VideoDetector({ 
  videoUrl, 
  confidenceThreshold, 
  overlapThreshold, 
  onPredictions 
}: VideoDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingLoop = useRef(false);

 useEffect(() => {
    if (videoRef.current) {
      videoRef.current.src = videoUrl;
      videoRef.current.load();
      clearOverlay();
      
      // Reset the state so it's ready for a fresh start
      setIsProcessing(false);
      processingLoop.current = false;
    }
  }, [videoUrl]);

  const clearOverlay = () => {
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
    onPredictions([]);
  };

  const processFrame = async () => {
    if (!processingLoop.current) return;

    const video = videoRef.current;
    const hiddenCanvas = hiddenCanvasRef.current;
    
    // 1. Standard safety checks
    if (!video || !hiddenCanvas || video.paused || video.ended) {
      setIsProcessing(false);
      processingLoop.current = false;
      return;
    }

    // 2. THE FIX: Wait for the video to actually have rendering dimensions!
    // If the browser hasn't loaded the video metadata yet, check again in 100ms.
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setTimeout(() => {
        if (processingLoop.current) processFrame();
      }, 100); 
      return;
    }

    // 3. Proceed with drawing and analysis
    const ctx = hiddenCanvas.getContext('2d');
    if (ctx) {
      hiddenCanvas.width = video.videoWidth;
      hiddenCanvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
      
      const frameBase64 = hiddenCanvas.toDataURL('image/jpeg');

      try {
        const inferenceResults = await runInference(frameBase64, confidenceThreshold, overlapThreshold);
        
        // Define AI dimensions clearly for the filter and the draw call
        const aiWidth = inferenceResults.image?.width || hiddenCanvas.width;
        const aiHeight = inferenceResults.image?.height || hiddenCanvas.height;
        const rawPreds = inferenceResults.predictions;

        // Identify "Cut-Off" People (those whose bottom is near the frame edge)
        const cutOffPeople = rawPreds.filter((p: any) => {
          if (p.class.toLowerCase() !== 'person') return false;
          const personBottom = p.y + (p.height / 2);
          return personBottom > (aiHeight * 0.90); // Bottom 10% threshold
        });

        // Filter out boot violations for people who are cut off
        const filteredPredictions = rawPreds.filter((pred: any) => {
          const isNoBoot = pred.class.toLowerCase().includes('no') && 
                           pred.class.toLowerCase().includes('boot');
          
          if (isNoBoot) {
            // Suppress if the violation box is horizontally aligned with a cut-off person
            const isNearCutOffPerson = cutOffPeople.some((person: any) => {
              const pXMin = person.x - (person.width / 2);
              const pXMax = person.x + (person.width / 2);
              return pred.x > pXMin && pred.x < pXMax;
            });

            if (isNearCutOffPerson) {
              return false; // Ignore this "ghost" violation
            }
          }
          return true;
        });

        // Update Dashboard and Draw
        onPredictions(filteredPredictions);
        drawBoxes(filteredPredictions, video.videoWidth, video.videoHeight, aiWidth, aiHeight);
        
      } catch (error) {
        console.error("Frame processing failed", error);
      }
    }

    // Continue the loop every 1 second
    setTimeout(() => {
      if (processingLoop.current) processFrame();
    }, 1000); 
  };

  const drawBoxes = (predictions: any[], vidWidth: number, vidHeight: number, aiWidth: number, aiHeight: number) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    
    overlay.width = vidWidth;
    overlay.height = vidHeight;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, vidWidth, vidHeight);

    const scaleX = vidWidth / aiWidth;
    const scaleY = vidHeight / aiHeight;

    predictions.forEach(pred => {
      const scaledWidth = pred.width * scaleX;
      const scaledHeight = pred.height * scaleY;
      const x = (pred.x * scaleX) - (scaledWidth / 2);
      const y = (pred.y * scaleY) - (scaledHeight / 2);
      
      const isViolation = pred.class.toLowerCase().includes('no');
      const color = isViolation ? '#ef4444' : '#22c55e'; 

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, scaledWidth, scaledHeight);

      ctx.fillStyle = color;
      ctx.font = 'bold 18px sans-serif';
      const text = `${pred.class} ${(pred.confidence * 100).toFixed(0)}%`;
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillRect(x, y - 28, textWidth + 16, 28);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 8, y - 8);
    });
  };

  const handlePlay = () => {
    setIsProcessing(true);
    if (!processingLoop.current) {
      processingLoop.current = true;
      processFrame();
    }
  };

  const handlePause = () => {
    setIsProcessing(false);
    processingLoop.current = false;
    clearOverlay();
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-b-2xl overflow-hidden min-h-[400px]">
      <video 
        ref={videoRef} 
        controls 
        autoPlay
        muted
        playsInline
        onPlaying={handlePlay}  
        onPause={handlePause}
        onEnded={handlePause} 
        className="w-full h-full object-contain"
      />
      <canvas 
        ref={overlayCanvasRef} 
        className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
      />
      <canvas ref={hiddenCanvasRef} className="hidden" />
      
      {isProcessing && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          AI Analyzing (1 FPS)
        </div>
      )}
    </div>
  );
}
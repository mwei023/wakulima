import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, CameraOff, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    startScanning();
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    try {
      setCameraError('');
      setIsScanning(true);
      
      // Initialize the barcode reader
      readerRef.current = new BrowserMultiFormatReader();
      
      // Get available video devices
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera devices found');
      }

      // Use the first available camera (usually back camera on mobile)
      const deviceId = videoInputDevices[0].deviceId;
      
      if (videoRef.current) {
        controlsRef.current = await readerRef.current.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, error) => {
            if (result) {
              const barcode = result.getText();
              toast({
                title: "Barcode Scanned",
                description: `Code: ${barcode}`,
              });
              onScan(barcode);
              stopScanning();
            }
            if (error && error.name !== 'NotFoundException') {
              console.warn('Barcode scan error:', error);
            }
          }
        );
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsScanning(false);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const stopScanning = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current = null;
    }
    setIsScanning(false);
  };

  const restartScanning = () => {
    stopScanning();
    setTimeout(() => startScanning(), 100);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Barcode Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-64 object-cover"
            autoPlay
            playsInline
          />
          {!isScanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white text-center">
                <CameraOff className="h-12 w-12 mx-auto mb-2" />
                <p>Camera not active</p>
              </div>
            </div>
          )}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/90">
              <div className="text-white text-center p-4">
                <CameraOff className="h-12 w-12 mx-auto mb-2" />
                <p className="text-sm">{cameraError}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          {isScanning ? (
            <p>Position the barcode within the frame to scan</p>
          ) : (
            <p>Scanner is not active</p>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={restartScanning}
            variant="outline"
            className="flex-1"
            disabled={isScanning}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restart
          </Button>
          <Button
            onClick={onClose}
            variant="destructive"
            className="flex-1"
          >
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
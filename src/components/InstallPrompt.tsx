import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('installPromptDismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (dismissed || isStandalone) {
      return;
    }

    // Listen for the native install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show custom prompt after a short delay, regardless of native event
    setTimeout(() => setShowPrompt(true), 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      navigate('/install');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
      <Card className="p-4 shadow-lg border-primary/50 bg-background/95 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <img 
              src="/icon-192.png" 
              alt="Wakulima" 
              className="w-12 h-12 rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">Install Wakulima</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Install our app for offline access and faster performance
            </p>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={handleInstallClick}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                Install
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => navigate('/install')}
              >
                Learn More
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-8 w-8"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
};
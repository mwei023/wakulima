import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Download, Share, Home, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 p-4">
      <div className="max-w-4xl mx-auto py-8">
        <div className="text-center mb-8">
          <img 
            src="/icon-192.png" 
            alt="Moo Insights" 
            className="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-lg"
          />
          <h1 className="text-4xl font-bold mb-2">Install Wakulima</h1>
          <p className="text-muted-foreground text-lg">
            Get the full app experience on your device
          </p>
        </div>

        {isInstalled && (
          <Card className="mb-6 border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-primary">
                <CheckCircle2 className="w-6 h-6" />
                <div>
                  <p className="font-semibold">App Already Installed!</p>
                  <p className="text-sm text-muted-foreground">
                    You can launch the app from your home screen
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate('/dashboard')} className="w-full mt-4">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {isInstallable && !isInstalled && (
          <Card className="mb-6 border-primary">
            <CardContent className="pt-6">
              <Button 
                onClick={handleInstallClick} 
                size="lg" 
                className="w-full"
              >
                <Download className="mr-2 h-5 w-5" />
                Install App Now
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                Why Install?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Works Offline</p>
                  <p className="text-sm text-muted-foreground">Access your farm data even without internet</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Faster Performance</p>
                  <p className="text-sm text-muted-foreground">Lightning-fast loading and smoother experience</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Home Screen Access</p>
                  <p className="text-sm text-muted-foreground">Quick access like a native app</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Auto Sync</p>
                  <p className="text-sm text-muted-foreground">Changes sync when you're back online</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5 text-primary" />
                Installation Guide
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="font-semibold mb-2">On iPhone/iPad (Safari):</p>
                  <ol className="text-sm space-y-1 text-muted-foreground">
                    <li>1. Tap the <Share className="inline h-4 w-4" /> Share button</li>
                    <li>2. Scroll down and tap "Add to Home Screen"</li>
                    <li>3. Tap "Add" in the top right</li>
                  </ol>
                </div>
                
                <div>
                  <p className="font-semibold mb-2">On Android (Chrome):</p>
                  <ol className="text-sm space-y-1 text-muted-foreground">
                    <li>1. Tap the menu (⋮) in the top right</li>
                    <li>2. Tap "Install app" or "Add to Home screen"</li>
                    <li>3. Tap "Install" to confirm</li>
                  </ol>
                </div>

                <div>
                  <p className="font-semibold mb-2">On Desktop (Chrome/Edge):</p>
                  <ol className="text-sm space-y-1 text-muted-foreground">
                    <li>1. Click the install icon in the address bar</li>
                    <li>2. Click "Install" to confirm</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Install;
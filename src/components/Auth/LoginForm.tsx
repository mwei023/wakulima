import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';

export const LoginForm = () => {
  const login = useStore(state => state.login);
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const success = login(credentials.username, credentials.password);
    
    if (!success) {
      toast({
        title: "Login Failed",
        description: "Invalid username or password",
        variant: "destructive"
      });
    }
    
    setIsLoading(false);
  };

  const demoLogin = (role: 'admin' | 'cashier') => {
    const username = role === 'admin' ? 'samuel' : 'grace';
    setCredentials({ username, password: 'password' });
    login(username, 'password');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Wakulima Agrovet</CardTitle>
          <p className="text-muted-foreground">Kiserian, Kenya</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                placeholder="Enter username"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="Enter password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
          
          <div className="mt-6">
            <Separator className="mb-4" />
            <p className="text-sm text-muted-foreground mb-3 text-center">Demo Login</p>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => demoLogin('admin')}
              >
                Login as Samuel (Admin)
              </Button>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => demoLogin('cashier')}
              >
                Login as Grace (Cashier)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Demo password: password
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
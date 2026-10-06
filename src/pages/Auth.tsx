import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { USERS } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { Leaf } from 'lucide-react';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleLogin = async (loginEmail: string) => {
    setLoading(true);
    try {
      await signIn(loginEmail || USERS[0].email);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Leaf className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">Wakulima Agrovet</span>
          </div>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Pick a profile to enter the demo. No password needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => handleLogin(USERS[0].email)} disabled={loading}>
            Enter as Admin
          </Button>
          <Button variant="outline" className="w-full" onClick={() => handleLogin(USERS[1].email)} disabled={loading}>
            Enter as Cashier
          </Button>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="email">Or sign in with email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@wakulima.local"
                disabled={loading}
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full" disabled={loading}>
              {loading ? 'Entering...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

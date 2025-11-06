import { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/utils';

interface Conflict {
  id: string;
  type: 'sale' | 'inventory' | 'customer';
  description: string;
  localData: any;
  serverData: any;
  timestamp: string;
}

export const ConflictResolver = () => {
  const { forceSync } = useStore();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);

  // Mock conflicts for demonstration - in real implementation, this would come from store
  const mockConflicts: Conflict[] = [
    {
      id: '1',
      type: 'sale',
      description: 'Sale #1234 was modified on both local and server',
      localData: { total: 1500, items: 3 },
      serverData: { total: 1600, items: 3 },
      timestamp: new Date().toISOString()
    }
  ];

  const resolveConflict = async (conflictId: string, useLocal: boolean) => {
    setResolving(conflictId);
    try {
      // In real implementation, this would call a store action to resolve the conflict
      // For now, just remove from local state
      setConflicts(conflicts.filter(c => c.id !== conflictId));
      // Trigger sync after resolution
      await forceSync();
    } catch (error) {
      console.error('Error resolving conflict:', error);
    } finally {
      setResolving(null);
    }
  };

  if (conflicts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            No Conflicts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">All data is synchronized. No conflicts to resolve.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected during sync. Please resolve them to continue.
        </AlertDescription>
      </Alert>

      {conflicts.map((conflict) => (
        <Card key={conflict.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Conflict #{conflict.id}
              </div>
              <Badge variant="outline">{conflict.type}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{conflict.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded p-3">
                <h4 className="font-medium text-green-600 mb-2">Local Version</h4>
                {conflict.type === 'sale' && (
                  <div className="text-sm">
                    <p>Total: {formatCurrency(conflict.localData.total)}</p>
                    <p>Items: {conflict.localData.items}</p>
                  </div>
                )}
              </div>

              <div className="border rounded p-3">
                <h4 className="font-medium text-blue-600 mb-2">Server Version</h4>
                {conflict.type === 'sale' && (
                  <div className="text-sm">
                    <p>Total: {formatCurrency(conflict.serverData.total)}</p>
                    <p>Items: {conflict.serverData.items}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => resolveConflict(conflict.id, true)}
                disabled={resolving === conflict.id}
                className="flex-1"
              >
                {resolving === conflict.id ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Use Local
              </Button>
              <Button
                variant="outline"
                onClick={() => resolveConflict(conflict.id, false)}
                disabled={resolving === conflict.id}
                className="flex-1"
              >
                {resolving === conflict.id ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Use Server
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

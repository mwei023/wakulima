import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from '@/hooks/use-toast';

export function useDataLoader() {
  const loadData = useStore(state => state.loadData);

  useEffect(() => {
    const initializeData = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error('Failed to load data:', error);
        toast({
          title: "Data Loading Error",
          description: "Using offline data. Some features may be limited.",
          variant: "destructive"
        });
      }
    };

    initializeData();
  }, [loadData]);
}
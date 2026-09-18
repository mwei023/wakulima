import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { Shield, Search, Download, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  table_name: string;
  record_id: string;
  old_values: Record<string, unknown>;
new_values: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export const AuditLog = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, tableFilter, actionFilter]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error('Error loading audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit logs',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = () => {
    let filtered = [...logs];

    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.record_id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (tableFilter !== 'all') {
      filtered = filtered.filter(log => log.table_name === tableFilter);
    }

    if (actionFilter !== 'all') {
      filtered = filtered.filter(log => log.action === actionFilter);
    }

    setFilteredLogs(filtered);
  };

  const exportToExcel = () => {
    const exportData = filteredLogs.map(log => ({
      Date: formatDate(log.created_at),
      Action: log.action,
      Table: log.table_name,
      'Record ID': log.record_id || 'N/A',
      'User ID': log.user_id || 'System',
      'User Agent': log.user_agent || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
    XLSX.writeFile(wb, `audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: 'Exported',
      description: 'Audit logs exported successfully'
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'default';
    if (action.includes('UPDATE')) return 'secondary';
    if (action.includes('DELETE')) return 'destructive';
    if (action.includes('EXPORT')) return 'secondary';
    return 'default';
  };

  const uniqueTables = [...new Set(logs.map(log => log.table_name))];
  const uniqueActions = [...new Set(logs.map(log => log.action))];

  if (loading) {
    return <div className="p-8 text-center">Loading audit logs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Audit Log
          </h2>
          <p className="text-muted-foreground">System activity and security audit trail</p>
        </div>
        <Button onClick={exportToExcel} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All tables" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {uniqueTables.map(table => (
                  <SelectItem key={table} value={table}>{table}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action}>{action}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Audit Logs Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || tableFilter !== 'all' || actionFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Audit logs will appear here as actions are performed'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map(log => (
            <Card key={log.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getActionColor(log.action) as any}>
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">on {log.table_name}</span>
                    </div>
                    {log.record_id && (
                      <p className="text-xs text-muted-foreground">
                        Record: {log.record_id.slice(0, 8)}...
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(log.created_at)}
                  </span>
                </div>
                
                {(log.old_values || log.new_values) && (
                  <div className="grid gap-2 md:grid-cols-2 mt-3 pt-3 border-t">
                    {log.old_values && (
                      <div className="text-xs">
                        <p className="font-medium mb-1 text-muted-foreground">Previous:</p>
                        <pre className="bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.old_values, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.new_values && (
                      <div className="text-xs">
                        <p className="font-medium mb-1 text-muted-foreground">Updated:</p>
                        <pre className="bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.new_values, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

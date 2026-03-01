"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyButton } from "@/components/shared/CopyButton";
import { EmptyState } from "@/components/shared/EmptyState";
import type { WebhookEndpointRow, WebhookEndpointCreateResult } from "@/types/session";
import { formatDate } from "@/lib/utils";

interface WebhookEndpointsManagerProps {
  endpoints: WebhookEndpointRow[];
  projectId: string;
  onCreate: (projectId: string, name: string) => Promise<WebhookEndpointCreateResult>;
  onRevoke: (id: string) => Promise<void>;
}

export function WebhookEndpointsManager({
  endpoints,
  projectId,
  onCreate,
  onRevoke,
}: WebhookEndpointsManagerProps) {
  const [endpointName, setEndpointName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState<WebhookEndpointCreateResult | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointName.trim()) return;
    setCreating(true);
    setNewEndpoint(null);
    try {
      const result = await onCreate(projectId, endpointName.trim());
      setNewEndpoint(result);
      setEndpointName("");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await onRevoke(id);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest">Webhook Endpoints</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Third-party services (Lemon Squeezy, GitHub, Stripe, etc.) POST to the webhook URL and
          sign requests with the{" "}
          <code className="text-primary/80 bg-background px-1 py-0.5 rounded text-[11px] border border-border">
            X-Signature
          </code>{" "}
          header. Each endpoint has its own signing secret.
        </p>
      </div>

      {/* Newly created endpoint banner */}
      {newEndpoint && (
        <Alert className="border-green-800 bg-green-950/30">
          <AlertTitle className="text-xs uppercase tracking-widest text-green-400 font-bold flex items-center justify-between">
            <span>Save these now — won&apos;t be shown again</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-green-400 hover:text-green-300 hover:bg-transparent -mt-0.5"
              onClick={() => setNewEndpoint(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertTitle>
          <AlertDescription className="mt-3 space-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-widest">
                Webhook URL
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={newEndpoint.webhookUrl}
                  className="font-mono text-xs bg-green-950/50 border-green-800 text-green-300"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <CopyButton value={newEndpoint.webhookUrl} />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-widest">
                Signing Secret
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={newEndpoint.secret}
                  className="font-mono text-xs bg-green-950/50 border-green-800 text-green-300"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <CopyButton value={newEndpoint.secret} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Configure this secret in your third-party service dashboard.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Endpoints table */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Webhook URL
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Created
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.length === 0 ? (
              <EmptyState colSpan={4} message="No webhook endpoints yet." />
            ) : (
              endpoints.map((ep) => (
                <TableRow key={ep.id} className="border-border">
                  <TableCell className="text-xs font-medium">{ep.name}</TableCell>
                  <TableCell className="text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-muted-foreground truncate max-w-[260px] block">
                        {ep.webhookUrl}
                      </span>
                      <CopyButton value={ep.webhookUrl} className="h-6 px-1.5 text-[10px]" />
                    </div>
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDate(ep.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                      disabled={revoking === ep.id}
                      onClick={() => void handleRevoke(ep.id)}
                    >
                      {revoking === ep.id ? "Revoking…" : "Revoke"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create new endpoint form */}
      <form onSubmit={(e) => void handleCreate(e)} className="flex items-center gap-2">
        <Input
          value={endpointName}
          onChange={(e) => setEndpointName(e.target.value)}
          placeholder="Endpoint name (e.g. Lemon Squeezy)"
          className="max-w-xs"
          required
        />
        <Button
          type="submit"
          size="sm"
          disabled={creating || !endpointName.trim()}
          className="gap-1.5 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          {creating ? "Creating…" : "Create endpoint"}
        </Button>
      </form>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { Computer, KeyRound, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pairingService, type Pairing, type RemoteOperation } from "@/services/pairingService";
import { connectRealtime } from "@/services/realtimeClient";

export function RemoteDevicesPage() {
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [systemInfo, setSystemInfo] = useState<RemoteOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [screen, setScreen] = useState<{ transferId: string; metadata: Record<string, unknown>; chunks: Record<number, string>; error?: string } | null>(null);
  const [streaming, setStreaming] = useState<{ streamId: string; operationId: string; status: "connecting" | "streaming" | "stopped" | "failed"; currentFrame?: string; width?: number; height?: number; mimeType?: string; error?: string } | null>(null);
  const frameBuffersRef = useRef<Record<string, { totalChunks: number; chunks: Record<number, string>; frameId?: string; streamId?: string }>>({});
  const frameUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
    };
  }, []);

  async function load() { try { setPairings(await pairingService.list()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Remote devices are unavailable."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => connectRealtime((event) => {
    if (event.type === "SCREEN_START") {
      const data = event.data as { transferId: string; metadata: Record<string, unknown> };
      setScreen({ transferId: data.transferId, metadata: data.metadata, chunks: {} });
    } else if (event.type === "SCREEN_CHUNK") {
      const data = event.data as { transferId: string; sequence: number; data: string };
      setScreen((current) => current?.transferId === data.transferId ? { ...current, chunks: { ...current.chunks, [data.sequence]: data.data } } : current);
    } else if (event.type === "SCREEN_FAILED") {
      const data = event.data as { reason: string };
      setScreen((current) => current ? { ...current, error: data.reason } : { transferId: "", metadata: {}, chunks: {}, error: data.reason });
    } else if (event.type === "SCREEN_END") {
      const data = event.data as { transferId: string };
      setScreen((current) => current?.transferId === data.transferId ? current : current);
    } else if (event.type === "SCREEN_STREAM_START") {
      const data = event.data as { streamId: string; operationId: string; metadata?: Record<string, unknown> };
      setStreaming({ streamId: data.streamId, operationId: data.operationId, status: "connecting", width: Number((data.metadata as { width?: number } | undefined)?.width ?? 0) || undefined, height: Number((data.metadata as { height?: number } | undefined)?.height ?? 0) || undefined, mimeType: String((data.metadata as { mimeType?: string } | undefined)?.mimeType ?? "image/png") });
    } else if (event.type === "SCREEN_STREAM_FRAME_START") {
      const data = event.data as { streamId: string; frameId: string; totalChunks: number; width?: number; height?: number; mimeType?: string; totalBytes?: number };
      frameBuffersRef.current[data.frameId] = { totalChunks: Number(data.totalChunks ?? 0), chunks: {}, frameId: data.frameId, streamId: data.streamId };
      setStreaming((current) => current && current.streamId === data.streamId ? { ...current, status: "streaming", width: data.width ?? current.width, height: data.height ?? current.height, mimeType: data.mimeType ?? current.mimeType ?? "image/png" } : current);
    } else if (event.type === "SCREEN_STREAM_CHUNK") {
      const data = event.data as { streamId: string; frameId: string; chunkIndex: number; totalChunks: number; payload?: string };
      const frame = frameBuffersRef.current[data.frameId];
      if (!frame || frame.streamId !== data.streamId) return;
      if (typeof data.payload !== "string") return;
      frame.chunks[data.chunkIndex] = data.payload;
      if (Object.keys(frame.chunks).length === frame.totalChunks) {
        const keys = Object.keys(frame.chunks).map(Number).sort((left, right) => left - right);
        const bytes = keys.map((index) => frame.chunks[index]).join("");
        const blob = new Blob([Uint8Array.from(atob(bytes), (byte) => byte.charCodeAt(0))], { type: "image/png" });
        const nextUrl = URL.createObjectURL(blob);
        if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = nextUrl;
        setStreaming((current) => current && current.streamId === data.streamId ? { ...current, status: "streaming", currentFrame: nextUrl, width: current.width, height: current.height, mimeType: current.mimeType ?? "image/png" } : current);
      }
    } else if (event.type === "SCREEN_STREAM_FRAME_END") {
      const data = event.data as { streamId: string; frameId: string; totalChunks: number };
      const frame = frameBuffersRef.current[data.frameId];
      if (frame && frame.streamId === data.streamId && Object.keys(frame.chunks).length === frame.totalChunks) {
        delete frameBuffersRef.current[data.frameId];
      }
    } else if (event.type === "SCREEN_STREAM_FRAME") {
      const data = event.data as { streamId: string; frameId: string; width?: number; height?: number; mimeType?: string; totalBytes?: number; data?: string };
      if (typeof data.data === "string" && data.data.length > 0) {
        const blob = new Blob([Uint8Array.from(atob(data.data), (byte) => byte.charCodeAt(0))], { type: data.mimeType ?? "image/png" });
        const nextUrl = URL.createObjectURL(blob);
        if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = nextUrl;
        setStreaming((current) => current && current.streamId === data.streamId ? { ...current, status: "streaming", currentFrame: nextUrl, width: data.width ?? current.width, height: data.height ?? current.height, mimeType: data.mimeType ?? current.mimeType ?? "image/png" } : current);
      }
    } else if (event.type === "SCREEN_STREAM_FAILED") {
      const data = event.data as { streamId: string; reason: string };
      setStreaming((current) => current && current.streamId === data.streamId ? { ...current, status: "failed", error: data.reason } : { streamId: data.streamId, operationId: "", status: "failed", error: data.reason });
    } else if (event.type === "SCREEN_STREAM_STOPPED") {
      const data = event.data as { streamId: string; metadata?: Record<string, unknown> };
      setStreaming((current) => current && current.streamId === data.streamId ? { ...current, status: "stopped", error: undefined } : current);
    }
  }), []);
  async function action(work: () => Promise<unknown>, message: string) { try { await work(); await load(); toast.success(message); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "The remote action failed."); } }
  async function getSystemInfo(pairedDeviceId: string) {
    try { const session = await pairingService.startSession(pairedDeviceId); setActiveSessionId(session.id); const operation = await pairingService.operation(pairedDeviceId, session.id); for (let attempt = 0; attempt < 20; attempt += 1) { const current = await pairingService.getOperation(operation.id); if (current.status !== "QUEUED") { setSystemInfo(current); return; } await new Promise((resolve) => setTimeout(resolve, 250)); } } catch (cause) { toast.error(cause instanceof Error ? cause.message : "System information is unavailable."); }
  }
  async function captureScreen(pairedDeviceId: string) {
    try { const session = activeSessionId ? { id: activeSessionId } : await pairingService.startSession(pairedDeviceId); setActiveSessionId(session.id); setScreen(null); await pairingService.operation(pairedDeviceId, session.id, "SCREEN_CAPTURE"); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Screen capture is unavailable."); }
  }
  async function startStream(pairedDeviceId: string) {
    try {
      const session = activeSessionId ? { id: activeSessionId } : await pairingService.startSession(pairedDeviceId);
      setActiveSessionId(session.id);
      setStreaming({ streamId: `stream-${Date.now()}`, operationId: "", status: "connecting" });
      console.info("[STREAM DEBUG] browser start requested");
      await pairingService.operation(pairedDeviceId, session.id, "SCREEN_STREAM");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Screen stream is unavailable."); }
  }
  async function stopStream(pairedDeviceId: string) {
    try { if (!activeSessionId) return; await pairingService.operation(pairedDeviceId, activeSessionId, "SCREEN_STREAM_STOP"); setStreaming((current) => current ? { ...current, status: "stopped" } : current); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Screen stream stop failed."); }
  }
  const screenData = screen && !screen.error ? Object.keys(screen.chunks).sort((a, b) => Number(a) - Number(b)).map((key) => screen.chunks[Number(key)]).join("") : null;
  return <div className="space-y-6">
    <PageHeader eyebrow="Controlled remote management" title="Remote Devices" description="Only explicitly paired agents can authenticate. Unsupported operations are never simulated." icon={Computer} />
    {loading ? <LoadingState label="Loading paired devices..." /> : null}{error ? <ErrorState message={error} /> : null}
    <section className="grid gap-3 rounded-xl border border-border bg-card/70 p-4 sm:grid-cols-3"><div className="space-y-2 sm:col-span-1"><Label htmlFor="remote-device-name">Device name</Label><Input id="remote-device-name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Lab workstation" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="remote-public-key">Agent public key</Label><Input id="remote-public-key" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="Paste the agent public key" /></div><Button className="sm:col-span-3" disabled={!deviceName || publicKey.length < 32} onClick={() => void action(() => pairingService.request(deviceName, publicKey), "Pairing request created.") }><KeyRound aria-hidden="true" /> Request pairing</Button></section>
    {pairings.length === 0 ? <EmptyState title="No data available" description="Create a pairing request from an authorized agent." /> : <div className="space-y-3">{pairings.map((pairing) => <article key={pairing.id} className="rounded-xl border border-border bg-card/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{pairing.deviceName}</p><p className="text-xs text-muted-foreground">Pairing {pairing.status} {pairing.pairedDevice ? `· device ${pairing.pairedDevice.status}` : ""}</p>{pairing.pairedDevice ? <p className="mt-1 text-xs text-muted-foreground">{pairing.pairedDevice.connectionStatus} · last seen {pairing.pairedDevice.lastSeen ? new Date(pairing.pairedDevice.lastSeen).toLocaleString() : "never"} · {pairing.pairedDevice.sessions.length ? "session active" : "no active session"}</p> : null}</div><StatusBadge tone={pairing.pairedDevice?.connectionStatus === "CONNECTED" ? "success" : pairing.status === "PENDING" ? "warning" : "accent"}>{pairing.pairedDevice?.connectionStatus ?? pairing.status}</StatusBadge></div><div className="mt-3 flex flex-wrap gap-2">{pairing.status === "PENDING" ? <><Button size="sm" onClick={() => void action(() => pairingService.approve(pairing.id), "Pairing approved.")}>Approve</Button><Button size="sm" variant="outline" onClick={() => void action(() => pairingService.reject(pairing.id), "Pairing rejected.")}>Reject</Button></> : null}{pairing.pairedDevice?.status === "PAIRED" ? <><Button size="sm" onClick={() => void getSystemInfo(pairing.pairedDevice!.id)}>System information</Button>{pairing.pairedDevice.connectionStatus === "CONNECTED" && (pairing.pairedDevice.sessions.length > 0 || activeSessionId) ? <Button size="sm" onClick={() => void captureScreen(pairing.pairedDevice!.id)}>Capture screen</Button> : null}<Button size="sm" variant="ghost" onClick={() => void action(() => pairingService.revoke(pairing.pairedDevice!.id), "Pairing revoked.")}><ShieldOff aria-hidden="true" /> Revoke</Button></> : null}</div></article>)}</div>}
    {systemInfo ? <section className="rounded-xl border border-border bg-card/70 p-4"><h2 className="font-semibold">System information</h2>{systemInfo.status === "COMPLETED" && systemInfo.resultJson ? <pre className="mt-3 overflow-auto text-xs text-muted-foreground">{JSON.stringify(systemInfo.resultJson, null, 2)}</pre> : <p className="mt-2 text-sm text-muted-foreground">{systemInfo.reason ?? systemInfo.status}</p>}</section> : null}
    {screen ? <section className="rounded-xl border border-border bg-card/70 p-4"><h2 className="font-semibold">Screen capture</h2>{screen.error ? <p className="mt-2 text-sm text-destructive">{screen.error}</p> : screenData ? <><img className="mt-3 max-h-[32rem] max-w-full rounded border border-border" src={`data:image/png;base64,${screenData}`} alt="Captured authorized screen" /><p className="mt-2 text-xs text-muted-foreground">{String(screen.metadata.width)} × {String(screen.metadata.height)} · {String(screen.metadata.byteLength)} bytes · {String(screen.metadata.capturedAt)}</p></> : <p className="mt-2 text-sm text-muted-foreground">Receiving a bounded screenshot...</p>}</section> : null}
    {streaming ? <section className="rounded-xl border border-border bg-card/70 p-4"><h2 className="font-semibold">Screen stream</h2><p className="mt-2 text-sm text-muted-foreground">{streaming.status === "connecting" ? "Connecting..." : streaming.status === "streaming" ? "Streaming" : streaming.status === "failed" ? "Failed" : "Stopped"}</p>{streaming.error ? <p className="mt-2 text-sm text-destructive">{streaming.error}</p> : null}{streaming.currentFrame ? <img className="mt-3 max-h-[32rem] max-w-full rounded border border-border" src={streaming.currentFrame} alt="Live authorized screen" /> : null}</section> : null}
    <Button variant="outline" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Refresh</Button>
  </div>;
}

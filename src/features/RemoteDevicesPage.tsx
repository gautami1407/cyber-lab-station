import { useEffect, useState } from "react";
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
    }
  }), []);
  async function action(work: () => Promise<unknown>, message: string) { try { await work(); await load(); toast.success(message); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "The remote action failed."); } }
  async function getSystemInfo(pairedDeviceId: string) {
    try { const session = await pairingService.startSession(pairedDeviceId); setActiveSessionId(session.id); const operation = await pairingService.operation(pairedDeviceId, session.id); for (let attempt = 0; attempt < 20; attempt += 1) { const current = await pairingService.getOperation(operation.id); if (current.status !== "QUEUED") { setSystemInfo(current); return; } await new Promise((resolve) => setTimeout(resolve, 250)); } } catch (cause) { toast.error(cause instanceof Error ? cause.message : "System information is unavailable."); }
  }
  async function captureScreen(pairedDeviceId: string) {
    try { const session = activeSessionId ? { id: activeSessionId } : await pairingService.startSession(pairedDeviceId); setActiveSessionId(session.id); setScreen(null); await pairingService.operation(pairedDeviceId, session.id, "SCREEN_CAPTURE"); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Screen capture is unavailable."); }
  }
  const screenData = screen && !screen.error ? Object.keys(screen.chunks).sort((a, b) => Number(a) - Number(b)).map((key) => screen.chunks[Number(key)]).join("") : null;
  return <div className="space-y-6">
    <PageHeader eyebrow="Controlled remote management" title="Remote Devices" description="Only explicitly paired agents can authenticate. Unsupported operations are never simulated." icon={Computer} />
    {loading ? <LoadingState label="Loading paired devices..." /> : null}{error ? <ErrorState message={error} /> : null}
    <section className="grid gap-3 rounded-xl border border-border bg-card/70 p-4 sm:grid-cols-3"><div className="space-y-2 sm:col-span-1"><Label htmlFor="remote-device-name">Device name</Label><Input id="remote-device-name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Lab workstation" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="remote-public-key">Agent public key</Label><Input id="remote-public-key" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="Paste the agent public key" /></div><Button className="sm:col-span-3" disabled={!deviceName || publicKey.length < 32} onClick={() => void action(() => pairingService.request(deviceName, publicKey), "Pairing request created.") }><KeyRound aria-hidden="true" /> Request pairing</Button></section>
    {pairings.length === 0 ? <EmptyState title="No data available" description="Create a pairing request from an authorized agent." /> : <div className="space-y-3">{pairings.map((pairing) => <article key={pairing.id} className="rounded-xl border border-border bg-card/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{pairing.deviceName}</p><p className="text-xs text-muted-foreground">Pairing {pairing.status} {pairing.pairedDevice ? `· device ${pairing.pairedDevice.status}` : ""}</p>{pairing.pairedDevice ? <p className="mt-1 text-xs text-muted-foreground">{pairing.pairedDevice.connectionStatus} · last seen {pairing.pairedDevice.lastSeen ? new Date(pairing.pairedDevice.lastSeen).toLocaleString() : "never"} · {pairing.pairedDevice.sessions.length ? "session active" : "no active session"}</p> : null}</div><StatusBadge tone={pairing.pairedDevice?.connectionStatus === "CONNECTED" ? "success" : pairing.status === "PENDING" ? "warning" : "accent"}>{pairing.pairedDevice?.connectionStatus ?? pairing.status}</StatusBadge></div><div className="mt-3 flex flex-wrap gap-2">{pairing.status === "PENDING" ? <><Button size="sm" onClick={() => void action(() => pairingService.approve(pairing.id), "Pairing approved.")}>Approve</Button><Button size="sm" variant="outline" onClick={() => void action(() => pairingService.reject(pairing.id), "Pairing rejected.")}>Reject</Button></> : null}{pairing.pairedDevice?.status === "PAIRED" ? <><Button size="sm" onClick={() => void getSystemInfo(pairing.pairedDevice!.id)}>System information</Button>{pairing.pairedDevice.connectionStatus === "CONNECTED" && (pairing.pairedDevice.sessions.length > 0 || activeSessionId) ? <Button size="sm" onClick={() => void captureScreen(pairing.pairedDevice!.id)}>Capture screen</Button> : null}<Button size="sm" variant="ghost" onClick={() => void action(() => pairingService.revoke(pairing.pairedDevice!.id), "Pairing revoked.")}><ShieldOff aria-hidden="true" /> Revoke</Button></> : null}</div></article>)}</div>}
    {systemInfo ? <section className="rounded-xl border border-border bg-card/70 p-4"><h2 className="font-semibold">System information</h2>{systemInfo.status === "COMPLETED" && systemInfo.resultJson ? <pre className="mt-3 overflow-auto text-xs text-muted-foreground">{JSON.stringify(systemInfo.resultJson, null, 2)}</pre> : <p className="mt-2 text-sm text-muted-foreground">{systemInfo.reason ?? systemInfo.status}</p>}</section> : null}
    {screen ? <section className="rounded-xl border border-border bg-card/70 p-4"><h2 className="font-semibold">Screen capture</h2>{screen.error ? <p className="mt-2 text-sm text-destructive">{screen.error}</p> : screenData ? <><img className="mt-3 max-h-[32rem] max-w-full rounded border border-border" src={`data:image/png;base64,${screenData}`} alt="Captured authorized screen" /><p className="mt-2 text-xs text-muted-foreground">{String(screen.metadata.width)} × {String(screen.metadata.height)} · {String(screen.metadata.byteLength)} bytes · {String(screen.metadata.capturedAt)}</p></> : <p className="mt-2 text-sm text-muted-foreground">Receiving a bounded screenshot...</p>}</section> : null}
    <Button variant="outline" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Refresh</Button>
  </div>;
}

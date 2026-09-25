import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Network, Radar, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertBanner } from "@/components/common/AlertBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { ApiError } from "@/services/apiClient";
import { networkService, type AuthorizedNetwork, type Device, type LocalInterface } from "@/services/networkService";

export function NetworksPage() {
  const { user, loading: authLoading } = useAuth();
  const [interfaces, setInterfaces] = useState<LocalInterface[]>([]);
  const [networks, setNetworks] = useState<AuthorizedNetwork[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!user) {
      setLoading(false);
      setError("UNAUTHENTICATED");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextInterfaces, nextNetworks, nextDevices] = await Promise.all([
        networkService.interfaces(),
        networkService.authorized(),
        networkService.devices(),
      ]);
      setInterfaces(nextInterfaces);
      setNetworks(nextNetworks);
      setDevices(nextDevices);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setError("UNAUTHENTICATED");
      } else {
        setError(cause instanceof Error ? cause.message : "Network data is unavailable.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      setError("UNAUTHENTICATED");
      return;
    }

    void load();
  }, [user, authLoading]);

  async function authorize(item: LocalInterface) {
    setBusy(item.cidr);
    try {
      await networkService.authorize(item);
      toast.success(`Authorized ${item.cidr}.`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Authorization failed.");
    } finally {
      setBusy(null);
    }
  }

  async function discover(id: string) {
    setBusy(id);
    try {
      await networkService.discover(id);
      toast.success("Discovery completed with observed local devices.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Discovery failed.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    try {
      await networkService.revoke(id);
      toast.message("Network authorization revoked.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Revocation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="NetLink foundation" title="Networks & Devices" description="Authorize a current local interface before discovery or diagnostics." icon={Network} />
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="NetLink foundation" title="Networks & Devices" description="Authorize a current local interface before discovery or diagnostics." icon={Network} />
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <h3 className="text-lg font-semibold">Authentication Required</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You must be signed in to authorize networks and discover devices.
          </p>
          <p className="mt-4">
            <Link
              to="/projects/authentication"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to Register / Login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="NetLink foundation" title="Networks & Devices" description="Authorize a current local interface before discovery or diagnostics." icon={Network} />
      <AlertBanner variant="warning" title="Explicit authorization required">
        The API re-checks the selected interface server-side. Remote devices are never fabricated when the operating system cannot observe them.
      </AlertBanner>
      
      {/* Show authentication required message */}
      {error === "UNAUTHENTICATED" ? (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <h3 className="text-lg font-semibold">Authentication Required</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You must be signed in to authorize networks and discover devices.
          </p>
          <p className="mt-4">
            <Link
              to="/projects/authentication"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to Register / Login
            </Link>
          </p>
        </div>
      ) : (
        <>
          {loading ? <LoadingState label="Reading local interfaces and inventory..." /> : null}
          {error && error !== "UNAUTHENTICATED" ? <ErrorState message={error} /> : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Local interfaces</h2>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</Button>
            </div>
            {interfaces.length === 0 ? <EmptyState title="No IPv4 interfaces available" description="The host did not expose an IPv4 interface to the API." /> : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">
                {interfaces.map((item) => {
                  const alreadyAuthorized = networks.some((network) => network.interfaceName === item.name && network.ipv4Address === item.ipv4Address && network.status === "AUTHORIZED");
                  return <div key={`${item.name}-${item.ipv4Address}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium">{item.name} <span className="font-mono text-xs text-muted-foreground">{item.cidr}</span></p><p className="text-xs text-muted-foreground">{item.ipv4Address} · {item.macAddress ?? "MAC unknown"}</p></div><Button size="sm" onClick={() => void authorize(item)} disabled={alreadyAuthorized || busy === item.cidr}>{alreadyAuthorized ? "Authorized" : "Authorize network"}</Button></div>;
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Authorized networks</h2>
            {networks.length === 0 ? <EmptyState title="No authorized networks" description="Choose an interface above to enable network discovery." /> : networks.map((network) => <div key={network.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 p-4"><div><p className="font-medium">{network.cidr}</p><p className="text-xs text-muted-foreground">{network.interfaceName} · {network._count.devices} observed device(s)</p></div><div className="flex gap-2"><Button size="sm" onClick={() => void discover(network.id)} disabled={busy === network.id}><Radar aria-hidden="true" /> Discover</Button><Button variant="ghost" size="icon" aria-label="Revoke network authorization" onClick={() => void revoke(network.id)} disabled={busy === network.id}><Trash2 aria-hidden="true" /></Button></div></div>)}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Observed devices</h2>
            {devices.length === 0 ? <EmptyState title="No data available" description="Run discovery on an authorized network." /> : <div className="grid gap-3 md:grid-cols-2">{devices.map((device) => <div key={device.id} className="rounded-xl border border-border bg-card/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{device.hostname ?? "Unknown host"}</p><p className="font-mono text-xs text-muted-foreground">{device.ipAddress} · {device.macAddress ?? "MAC unknown"}</p><p className="mt-1 text-xs text-muted-foreground">{device.vendor ?? "Vendor unknown"}</p></div><StatusBadge tone={device.status === "ONLINE" ? "success" : "accent"}>{device.status}</StatusBadge></div><p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3" /> Risk {device.riskLevel}</p><p className="mt-1 text-xs text-muted-foreground">Last seen {formatDateTime(device.lastSeen)}</p><p className="text-xs text-muted-foreground">{device.authorizedNetwork?.interfaceName ?? "Network unknown"} · {device.authorizedNetwork?.cidr ?? "No network"}</p></div>)}</div>}
          </section>
        </>
      )}
    </div>
  );
}
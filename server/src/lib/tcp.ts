import net from "node:net";

export async function tcpConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ status: "open" | "closed" | "timeout" | "error"; responseTimeMs: number | null }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (status: "open" | "closed" | "timeout" | "error") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const elapsed = Date.now() - started;
      resolve({
        status,
        responseTimeMs: status === "open" ? elapsed : status === "closed" ? elapsed : null,
      });
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      finish("open");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ECONNREFUSED") finish("closed");
      else if (error.code === "ETIMEDOUT") finish("timeout");
      else finish("error");
    });
  });
}

const WELL_KNOWN: Record<number, string> = {
  22: "ssh",
  80: "http",
  443: "https",
  25: "smtp",
  53: "dns",
  110: "pop3",
  143: "imap",
  3306: "mysql",
  5432: "postgresql",
  8080: "http-alt",
};

export function conservativeServiceName(port: number): string {
  return WELL_KNOWN[port] ?? "unknown";
}

export const COMMON_PORTS = [22, 25, 53, 80, 110, 143, 443, 3306, 3389, 5432, 8080];
export const WEB_PORTS = [80, 443, 8080];

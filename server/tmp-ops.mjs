
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ops = await p.remoteOperation.findMany({ orderBy: { createdAt: "desc" }, take: 12 });
console.log(JSON.stringify(ops.map((o) => ({ op: o.operation, status: o.status, reason: o.reason })), null, 2));
await p.$disconnect();

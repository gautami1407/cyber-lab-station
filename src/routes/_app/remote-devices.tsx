import { createFileRoute } from "@tanstack/react-router";
import { RemoteDevicesPage } from "@/features/RemoteDevicesPage";

export const Route = createFileRoute("/_app/remote-devices")({ component: RemoteDevicesPage });

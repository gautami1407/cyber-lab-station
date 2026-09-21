import { createFileRoute } from "@tanstack/react-router";
import { DeviceDetailPage } from "@/features/DeviceDetailPage";

export const Route = createFileRoute("/_app/devices/$id")({ component: DeviceDetailPage });

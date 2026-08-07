import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toReceiptItem } from "@/lib/receipt";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import TransportTabs from "@/components/TransportTabs";
import { IconTransport } from "@/components/icons";

export default async function TransportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trip, receipts] = await Promise.all([
    prisma.trip.findUnique({ where: { id } }),
    prisma.receipt.findMany({
      where: { tripId: id, category: "TRANSPORT" },
      orderBy: { createdAt: "desc" },
      include: { images: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!trip) notFound();

  return (
    <main className="space-y-6">
      <CategoryPageHeader
        tripId={id}
        icon={<IconTransport className="size-6 text-blue-600 dark:text-blue-400" />}
        title="교통"
        accent="bg-blue-500/10"
      />
      <TransportTabs
        tripId={id}
        autoSettlement={trip.autoSettlement}
        receiptsByMode={{
          SHIP: receipts.filter((r) => r.transportMode === "SHIP").map(toReceiptItem),
          AIR: receipts.filter((r) => r.transportMode === "AIR").map(toReceiptItem),
          RAIL: receipts.filter((r) => r.transportMode === "RAIL").map(toReceiptItem),
          PRIVATE_CAR: receipts.filter((r) => r.transportMode === "PRIVATE_CAR").map(toReceiptItem),
          BUS: receipts.filter((r) => r.transportMode === "BUS").map(toReceiptItem),
        }}
      />
    </main>
  );
}

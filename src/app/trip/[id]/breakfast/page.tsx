import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toReceiptItem } from "@/lib/receipt";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import ReceiptManager from "@/components/ReceiptManager";
import { IconBreakfast } from "@/components/icons";

export default async function BreakfastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trip, receipts] = await Promise.all([
    prisma.trip.findUnique({ where: { id } }),
    prisma.receipt.findMany({
      where: { tripId: id, category: "BREAKFAST" },
      orderBy: { createdAt: "desc" },
      include: { images: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!trip) notFound();

  return (
    <main className="space-y-6">
      <CategoryPageHeader
        tripId={id}
        icon={<IconBreakfast className="size-12" />}
        title="조식"
      />
      <ReceiptManager
        tripId={id}
        category="BREAKFAST"
        initialReceipts={receipts.map(toReceiptItem)}
        autoSettlement={trip.autoSettlement}
      />
    </main>
  );
}

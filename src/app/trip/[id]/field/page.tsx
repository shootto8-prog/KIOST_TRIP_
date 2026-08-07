import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toReceiptItem } from "@/lib/receipt";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import ReceiptManager from "@/components/ReceiptManager";
import { IconPhoto } from "@/components/icons";

export default async function FieldPhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trip, receipts] = await Promise.all([
    prisma.trip.findUnique({ where: { id } }),
    prisma.receipt.findMany({
      where: { tripId: id, category: "FIELD" },
      orderBy: { createdAt: "desc" },
      include: { images: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!trip) notFound();

  return (
    <main className="space-y-6">
      <CategoryPageHeader
        tripId={id}
        icon={<IconPhoto className="size-6 text-rose-600 dark:text-rose-400" />}
        title="현장사진"
        accent="bg-rose-500/10"
      />
      <ReceiptManager
        tripId={id}
        category="FIELD"
        initialReceipts={receipts.map(toReceiptItem)}
        autoSettlement={trip.autoSettlement}
      />
    </main>
  );
}

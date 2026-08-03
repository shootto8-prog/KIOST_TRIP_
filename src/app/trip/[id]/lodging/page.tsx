import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toReceiptItem } from "@/lib/receipt";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import ReceiptManager from "@/components/ReceiptManager";
import { IconLodging } from "@/components/icons";

export default async function LodgingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip) notFound();

  const receipts = await prisma.receipt.findMany({
    where: { tripId: id, category: "LODGING" },
    orderBy: { createdAt: "desc" },
    include: { images: { orderBy: { order: "asc" } } },
  });

  return (
    <main className="space-y-6">
      <CategoryPageHeader
        tripId={id}
        icon={<IconLodging className="size-5 text-violet-600 dark:text-violet-400" />}
        title="숙박"
        accent="bg-violet-500/10"
      />
      <ReceiptManager
        tripId={id}
        category="LODGING"
        initialReceipts={receipts.map(toReceiptItem)}
      />
    </main>
  );
}

import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

export default function BatchNotFound() {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-1.5 p-7 text-center text-sm">
      <h2 className="text-[15px] font-medium">找不到這批預約</h2>
      <p className="text-muted-foreground">這個連結可能已經失效，或者網址打錯了。</p>
      <Link href="/bookings" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-3")}>
        回到預約列表
      </Link>
    </main>
  );
}

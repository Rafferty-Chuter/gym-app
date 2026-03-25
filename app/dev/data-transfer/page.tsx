import { notFound } from "next/navigation";
import DevDataTransferClient from "./DevDataTransferClient";

function paramIsUnlock(
  sp: Record<string, string | string[] | undefined>,
  key: string
): boolean {
  const v = sp[key];
  if (v === undefined) return false;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s === "true";
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DevDataTransferPage({ searchParams }: Props) {
  const sp = await searchParams;
  const queryUnlock =
    paramIsUnlock(sp, "transfer") || paramIsUnlock(sp, "devtools");
  const isDev = process.env.NODE_ENV === "development";

  if (!queryUnlock && !isDev) {
    notFound();
  }

  return <DevDataTransferClient />;
}

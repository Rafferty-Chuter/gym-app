import { notFound } from "next/navigation";
import DevDataTransferClient from "./DevDataTransferClient";

export default function DevDataTransferPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <DevDataTransferClient />;
}

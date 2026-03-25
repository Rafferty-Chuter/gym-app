import DevDataTransferClient from "./DevDataTransferClient";

/** Data export/import — reachable from Profile → Data Tools (works in production). */
export default function DataTransferPage() {
  return <DevDataTransferClient />;
}

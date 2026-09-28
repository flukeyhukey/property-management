import { redirect } from "next/navigation";

/** The app opens on the queue. No menu to reach it. */
export default function Home() {
  redirect("/queue");
}

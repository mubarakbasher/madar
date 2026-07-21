import { notFound } from "next/navigation";

/* Routes the branded [locale]/not-found.tsx for any unknown in-locale path
   (without this catch-all, Next.js falls through to its unstyled 404). */
export default function CatchAllNotFound() {
  notFound();
}

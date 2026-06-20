import { redirect } from "next/navigation";
// Admin conducteurs = same as gestionnaire view
export default function AdminConducteursPage() {
  redirect("/gestionnaire/conducteurs");
}

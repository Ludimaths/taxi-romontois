"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BorderBeam } from "@/components/ui/border-beam"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bus, Users, Wrench, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react"

const ROLES = [
  {
    icon: <Users className="size-5 text-blue-600" />,
    title: "Gestionnaire",
    desc: "Tableau de bord, conducteurs, imprévus, rapports",
    color: "border-blue-200 bg-blue-50",
  },
  {
    icon: <Bus className="size-5 text-green-600" />,
    title: "Conducteur",
    desc: "Service, signalements, historique, messages",
    color: "border-green-200 bg-green-50",
  },
  {
    icon: <Wrench className="size-5 text-amber-600" />,
    title: "Mécanicien",
    desc: "Réceptions, atelier, réparations, budget",
    color: "border-amber-200 bg-amber-50",
  },
  {
    icon: <AlertTriangle className="size-5 text-red-500" />,
    title: "Admin",
    desc: "Validation budget, statistiques, historique",
    color: "border-red-200 bg-red-50",
  },
]

const STATS = [
  { label: "Conducteurs", value: "53" },
  { label: "Véhicules", value: "24" },
  { label: "Circuits", value: "54" },
  { label: "Cercles scolaires", value: "16" },
]

export function Hero195() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white py-20 px-4">

      {/* Badge */}
      <div className="flex justify-center mb-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
          🚌 Transport scolaire · Fribourg, Suisse
        </span>
      </div>

      {/* Heading */}
      <div className="text-center max-w-3xl mx-auto mb-6">
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight mb-4">
          Taxi Romontois
          <span className="block text-blue-600 mt-1">Plateforme de gestion</span>
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
          Conducteurs, véhicules, circuits et imprévus — tout géré en temps réel depuis un seul tableau de bord.
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-wrap gap-3 justify-center mb-16">
        <Button size="lg" asChild className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6">
          <Link href="/login">Se connecter <ArrowRight className="size-4" /></Link>
        </Button>
        <Button size="lg" variant="outline" asChild className="gap-2 px-6">
          <a href="#roles">Découvrir la plateforme</a>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto mb-16">
        {STATS.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-black text-slate-900">{s.value}</div>
            <div className="text-sm text-slate-400 font-medium mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Dashboard preview with BorderBeam */}
      <div className="max-w-4xl mx-auto">
        <Card className="relative overflow-hidden shadow-2xl border-slate-200">
          <BorderBeam size={300} duration={12} colorFrom="#3b82f6" colorTo="#6366f1" />

          <CardHeader className="border-b border-slate-100 bg-slate-50/80">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-red-400" />
                <span className="size-3 rounded-full bg-amber-400" />
                <span className="size-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-slate-400 font-mono">taxi-romontois · tableau de bord</span>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <Tabs defaultValue="gestionnaire">
              <TabsList className="mb-6">
                <TabsTrigger value="gestionnaire">Gestionnaire</TabsTrigger>
                <TabsTrigger value="conducteur">Conducteur</TabsTrigger>
                <TabsTrigger value="mecanicien">Mécanicien</TabsTrigger>
              </TabsList>

              {/* Gestionnaire tab */}
              <TabsContent value="gestionnaire">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Véhicules en service", val: "24", color: "text-green-600 bg-green-50" },
                    { label: "Conducteurs présents", val: "53", color: "text-blue-600 bg-blue-50" },
                    { label: "Circuits couverts",    val: "54", color: "text-green-600 bg-green-50" },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
                      <div className="text-2xl font-black">{s.val}</div>
                      <div className="text-xs font-semibold mt-1 opacity-80">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    "54 circuits couverts · Aucun incident",
                    "Tous les conducteurs en service",
                    "Flotte complète opérationnelle",
                  ].map(t => (
                    <div key={t} className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700 font-semibold">
                      <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Conducteur tab */}
              <TabsContent value="conducteur">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 mb-4">
                  <div className="font-bold text-blue-900 text-base mb-1">Circuit C012 · 🦋 Papillon</div>
                  <div className="text-sm text-blue-600">FR-80058 · Mercedes Vito · 8 places</div>
                  <div className="flex items-center gap-2 mt-3">
                    <CheckCircle2 className="size-4 text-green-500" />
                    <span className="text-sm text-green-700 font-semibold">En service depuis 07:45</span>
                  </div>
                </div>
                <div className="text-sm text-slate-400 text-center py-2">
                  Aucun incident signalé aujourd&apos;hui
                </div>
              </TabsContent>

              {/* Mécanicien tab */}
              <TabsContent value="mecanicien">
                <div className="space-y-3">
                  {[
                    { plaque: "FR-150296", desc: "Voyant moteur — Réparation en cours", statut: "🔧 En réparation", color: "border-amber-200" },
                    { plaque: "VD-45231",  desc: "Révision annuelle", statut: "✅ Prêt",          color: "border-green-200"  },
                  ].map(r => (
                    <div key={r.plaque} className={`rounded-xl border-2 ${r.color} bg-white px-4 py-3`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold text-slate-900">{r.plaque}</div>
                          <div className="text-sm text-slate-500 mt-0.5">{r.desc}</div>
                        </div>
                        <span className="text-xs font-bold">{r.statut}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Rôles */}
      <div id="roles" className="max-w-4xl mx-auto mt-16">
        <p className="text-center text-sm font-semibold text-slate-400 uppercase tracking-widest mb-6">
          4 comptes · 4 rôles · 1 plateforme
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {ROLES.map(r => (
            <Card key={r.title} className={`border-2 ${r.color}`}>
              <CardHeader className="pb-2">
                <div className="mb-2">{r.icon}</div>
                <CardTitle className="text-sm">{r.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">{r.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

    </section>
  )
}

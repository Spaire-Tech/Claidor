'use client'

import { useState } from 'react'

/**
 * The guides from the design, verbatim — this is the one screen whose
 * design content is real product documentation rather than placeholder,
 * so it ships as written.
 */
const GUIDES = [
  {
    title: 'Lire le signal d’autorité',
    tag: 'Fiabilité',
    body: [
      'Chaque réponse de Claidor est accompagnée d’un signal d’autorité : il indique si la solution repose sur une jurisprudence constante ou sur une décision isolée.',
      'Un point vert signale une jurisprudence constante — plusieurs décisions CCJA concordantes, avec la dernière en date. Un point ambre signale une autorité limitée : décision unique, ancienne, ou absence de décision directement applicable.',
      'Le signal n’est pas une conclusion juridique : il mesure le poids du fondement, pas la justesse de la réponse. Ouvrez toujours les sources classées sous la réponse avant de plaider.',
    ],
  },
  {
    title: 'Faits du dossier et règles du corpus',
    tag: 'Dossiers',
    body: [
      'Les réponses de Claidor tournent souvent sur des détails de fait : la date d’un acte, la juridiction saisie, les sommes en cause. Ces détails sont dans les pièces du dossier — Claidor les lit au lieu de vous les demander.',
      'Dans une réponse de dossier, chaque affirmation est étiquetée : un fait tiré d’une pièce est marqué « Pièce », une règle tirée d’un texte est marquée « Article ». Vous savez toujours ce qui repose sur le dossier et ce qui repose sur le droit.',
      'Le bloc « Fait retenu / Droit applicable » en tête de réponse résume ce croisement : le dossier fournit les faits, le corpus fournit la règle — et la version du texte est choisie d’après la date des faits.',
    ],
  },
  {
    title: 'Bien formuler une question',
    tag: 'Méthode',
    body: [
      'Claidor répond mieux aux questions qui précisent l’acte concerné, la juridiction et, si possible, la date des faits.',
      'Si votre question dépend de la version du texte et qu’aucune date n’y figure, Claidor demande la date plutôt que de deviner — ou répond pour les deux régimes si vous le souhaitez.',
      'Une question rattachée à un dossier est journalisée pour l’équipe de l’affaire : chacun voit ce qui a été demandé, par qui, et sur quel fondement la réponse repose.',
    ],
  },
]

export const GuidesPage = () => {
  const [selected, setSelected] = useState(0)
  const guide = GUIDES[selected]

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className="flex w-[280px] flex-none flex-col gap-px overflow-y-auto p-4"
        style={{ borderRight: '1px solid var(--b1)' }}
      >
        <div
          className="px-2 pb-3 text-[11px] font-medium"
          style={{ color: 'var(--t5)' }}
        >
          Guides
        </div>
        {GUIDES.map((g, i) => (
          <button
            key={g.title}
            type="button"
            onClick={() => setSelected(i)}
            className="claidor-hover-row cursor-pointer rounded-[7px] px-3 py-2 text-left"
            style={{
              background: i === selected ? 'var(--s8)' : 'transparent',
            }}
          >
            <div
              className="text-[13.5px] font-medium"
              style={{ color: 'var(--ink)' }}
            >
              {g.title}
            </div>
            <div className="text-[11.5px]" style={{ color: 'var(--t4)' }}>
              {g.tag}
            </div>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-8 py-12">
          <div
            className="text-[11px] font-medium tracking-wide uppercase"
            style={{ color: 'var(--t4)' }}
          >
            {guide.tag}
          </div>
          <h1 className="claidor-serif mt-2 text-[26px] font-semibold">
            {guide.title}
          </h1>
          <div className="mt-6 flex flex-col gap-y-4">
            {guide.body.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="text-[14.5px] leading-[1.7]"
                style={{ color: 'var(--t1)' }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

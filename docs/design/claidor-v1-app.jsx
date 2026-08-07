
class Component extends DCLogic {
  state = { view: 'assistant', chat: false, input: '', messages: [], panel: null, activeConv: null, extraConvs: [],
    revealed: 0, streamingIdx: -1, dossier: null, an: null, guide: 0, menu: null,
    searchOpen: false, searchQ: '', selSources: { au: true, cj: true }, dossierSel: null, dossierSelId: null, clientSel: null,
    deep: false, concise: false, notes: true, toast: '', hist: [],
    readerDone: false, fMat: null, fSince: null, fCh: null,
    veilles: [
      { id: 'a170', label: 'Art. 170, AUPSRVE', sub: 'Nouvelle décision · révision du texte', on: true, last: 'Signal ce matin' },
      { id: 'aupsrve', label: 'AUPSRVE — acte entier', sub: 'Réformes publiées au JO', on: true, last: 'Signal le 12 juil.' },
      { id: 'a14', label: 'Art. 14, AUS', sub: 'Nouvelle décision', on: true, last: 'Signal le 28 juin' } ] };

  data() {
    if (this._d) return this._d;
    const K = {
      piece: { kind: 'Pièce', color: 'var(--amber)', d: 'M3 1.5h7L13 4.5v10H3zM10 1.5v3h3M5.5 8h5M5.5 10.5h3' },
      article: { kind: 'Article', color: 'var(--blue)', d: 'M8 2.5C6.5 1.6 4.5 1.4 2.5 1.4v11.2c2 0 4 0.2 5.5 1.1 1.5-0.9 3.5-1.1 5.5-1.1V1.4c-2 0-4 0.2-5.5 1.1zM8 2.5v11.2' },
      decision: { kind: 'Décision', color: 'var(--red)', d: 'M8 2v11M5 13h6M8 3.5L3.5 5M8 3.5L12.5 5M3.5 5l-1.8 4a2.3 2.3 0 003.6 0zM12.5 5l-1.8 4a2.3 2.3 0 003.6 0z' },
    };
    const decisions = {
      d1: { title: 'CCJA, 3e ch., 12 avril 2018', meta: 'Arrêt n° 084/2018 · Pourvoi n° 211/2016/PC', relevance: 'Directement applicable — applique l\u2019art. 45', hl: 1,
        extract: ['Attendu que la saisie-attribution pratiquée sur un compte bancaire suppose que le créancier soit muni d\u2019un titre exécutoire constatant une créance liquide et exigible ; qu\u2019en l\u2019espèce, le titre produit satisfait à ces exigences ;', 'Attendu que le tiers saisi est tenu de déclarer sur-le-champ l\u2019étendue de ses obligations à l\u2019égard du débiteur ; que la déclaration inexacte de la banque l\u2019expose au paiement des causes de la saisie ;'],
        articles: ['a45'] },
      d2: { title: 'CCJA, 1re ch., 25 juin 2020', meta: 'Arrêt n° 156/2020 · Pourvoi n° 099/2018/PC', relevance: 'Pertinent — distingue le cas du compte joint', hl: 0,
        extract: ['Attendu que, lorsque le compte saisi est un compte joint, la saisie ne peut porter que sur la part du débiteur saisi, sauf à établir la solidarité des cotitulaires ;', 'Que c\u2019est donc à bon droit que la cour d\u2019appel a cantonné les effets de la saisie à la quote-part du débiteur ;'],
        articles: ['a45'] },
      d3: { title: 'CCJA, ass. plén., 19 mars 2015', meta: 'Arrêt n° 027/2015 · Pourvoi n° 045/2012/PC', relevance: 'Interprétation historique', hl: -1,
        extract: ['Attendu que les conditions de la saisie des créances de sommes d\u2019argent s\u2019apprécient au jour de l\u2019acte de saisie ;', 'Que la Cour retient une lecture stricte des exigences du titre exécutoire, dans sa rédaction alors en vigueur ;'],
        articles: ['a45'] },
      d4: { title: 'CCJA, 2e ch., 8 février 2021', meta: 'Arrêt n° 031/2021 · Pourvoi n° 187/2019/PC', relevance: 'Directement applicable — applique l\u2019art. 14', hl: 0,
        extract: ['Attendu que le cautionnement ne se présume pas ; qu\u2019il doit être constaté dans un acte comportant la signature de la caution et la mention, écrite de sa main, de la somme maximale garantie en toutes lettres et en chiffres ;', 'Qu\u2019en l\u2019absence de cette mention, l\u2019engagement est nul ; que la cour d\u2019appel a exactement appliqué ce texte ;'],
        articles: ['a14'] },
      d5: { title: 'CCJA, 3e ch., 14 novembre 2019', meta: 'Arrêt n° 264/2019 · Pourvoi n° 133/2017/PC', relevance: 'Pertinent — caution dirigeante avertie', hl: 0,
        extract: ['Attendu que la qualité de dirigeant de la société garantie ne dispense pas du formalisme protecteur de l\u2019article 14 ; que la Cour écarte toute atténuation prétorienne de ce formalisme ;'],
        articles: ['a14'] },
      d6: { title: 'CCJA, 1re ch., 7 juillet 2022', meta: 'Arrêt n° 118/2022 · Pourvoi n° 302/2020/PC', relevance: 'Décision unique sur le point de départ du délai', hl: 0,
        extract: ['Attendu que l\u2019opposition à l\u2019ordonnance d\u2019injonction de payer doit être formée dans les quinze jours de la signification ; que ce délai court à compter de la signification à personne ou, à défaut, du premier acte signifié à personne ;', 'Que l\u2019opposition formée hors délai est irrecevable, sans que le juge puisse relever le débiteur de la forclusion ;'],
        articles: ['a10'] },
      d7: { title: 'CCJA, 2e ch., 30 janvier 2019', meta: 'Arrêt n° 012/2019', relevance: 'Applique l\u2019art. 45', hl: 0,
        extract: ['Attendu que la saisie pratiquée sans titre exécutoire est nulle ; que la mainlevée s\u2019impose ;'], articles: ['a45'] },
      d8: { title: 'CCJA, 2e ch., 26 avril 2018', meta: 'Arrêt n° 090/2018 · Pourvoi n° 178/2016/PC', relevance: 'Directement applicable — forclusion de l\u2019art. 170', hl: 0,
        extract: ['Attendu que la contestation de la saisie-attribution formée après l\u2019expiration du délai d\u2019un mois de l\u2019article 170 est irrecevable ; que le juge ne dispose d\u2019aucun pouvoir pour relever le débiteur de cette forclusion ;'],
        articles: ['a170'] },
      d9: { title: 'CCJA, 1re ch., 14 mars 2013', meta: 'Arrêt n° 001/2013', relevance: 'Ligne de l\u2019art. 170 — articulation avec l\u2019art. 49', hl: 0,
        extract: ['Attendu que l\u2019article 172 déroge à l\u2019article 49 ; que le contentieux de la contestation de la saisie-attribution relève du juge désigné par l\u2019article 170 ;'],
        articles: ['a170'] },
      d10: { title: 'CCJA, 2e ch., 10 juin 2010', meta: 'Arrêt n° 038/2010', relevance: 'Ligne de l\u2019art. 170 — forclusion d\u2019ordre public', hl: 0,
        extract: ['Attendu que le délai de contestation de l\u2019article 170 est d\u2019ordre public ; qu\u2019il ne peut être ni suspendu ni interrompu par une réclamation adressée au créancier ;'],
        articles: ['a170'] },
      d11: { title: 'CCJA, 2e ch., 8 avril 2010', meta: 'Arrêt n° 025/2010', relevance: 'Ligne de l\u2019art. 170 — pas de relevé de forclusion', hl: 0,
        extract: ['Attendu que le juge ne peut relever le débiteur forclos de la déchéance encourue ; que la contestation tardive est irrecevable ;'],
        articles: ['a170'] },
    };
    const articles = {
      a45: { ref: 'Article 45', act: 'AUPSRVE — Acte uniforme portant organisation des procédures simplifiées de recouvrement et des voies d\u2019exécution', label: 'Art. 45, AUPSRVE', current: 'En vigueur · 2024', versions: ['2021', '2017'], hl: 0,
        changes: [ { sign: '+', text: 'alinéa 2 ajouté — déclaration du tiers saisi par voie électronique admise' }, { sign: '−', text: 'alinéa 4 supprimé — renvoi au droit national des délais de grâce' } ],
        text: ['Toute personne munie d\u2019un titre exécutoire constatant une créance liquide et exigible peut, pour en obtenir le paiement, saisir entre les mains d\u2019un tiers les créances de sommes d\u2019argent appartenant à son débiteur.', 'Le tiers saisi est tenu de déclarer au créancier l\u2019étendue de ses obligations à l\u2019égard du débiteur. Cette déclaration peut être faite par voie électronique.'],
        citedCount: 23, top: ['d1', 'd2', 'd7'], citedWith: ['Art. 153, AUPSRVE', 'Art. 156, AUPSRVE', 'Art. 38, AUPSRVE'] },
      a14: { ref: 'Article 14', act: 'AUS — Acte uniforme portant organisation des sûretés', label: 'Art. 14, AUS', current: 'En vigueur · 2010', versions: ['1997'], hl: 1,
        changes: [ { sign: '+', text: 'exigence de la mention manuscrite de la somme maximale garantie' } ],
        text: ['Le cautionnement ne se présume pas. Il doit être convenu de façon expresse entre la caution et le créancier.', 'À peine de nullité, l\u2019acte comporte la signature de la caution et la mention, écrite de sa main, de la somme maximale garantie, en toutes lettres et en chiffres.'],
        citedCount: 17, top: ['d4', 'd5'], citedWith: ['Art. 13, AUS', 'Art. 25, AUS'] },
      a10: { ref: 'Article 10', act: 'AUPSRVE — Acte uniforme portant organisation des procédures simplifiées de recouvrement et des voies d\u2019exécution', label: 'Art. 10, AUPSRVE', current: 'En vigueur · 2024', versions: ['1998'], hl: 0,
        changes: [ { sign: '+', text: 'précision du point de départ du délai en cas de signification à domicile' } ],
        text: ['L\u2019opposition doit être formée dans les quinze jours qui suivent la signification de la décision portant injonction de payer.', 'Le délai est augmenté, éventuellement, des délais de distance.'],
        citedCount: 9, top: ['d6'], citedWith: ['Art. 9, AUPSRVE', 'Art. 12, AUPSRVE'] },
      a170: { ref: 'Article 170', act: 'AUPSRVE — rédaction de 1998, applicable aux procédures engagées avant le 16 février 2024', label: 'Art. 170, AUPSRVE (1998)', current: 'Version 1998 · applicable au dossier', versions: ['2023 (en vigueur)'], hl: 0,
        changes: [ { sign: '+', text: 'alinéa 2 — notification de la contestation par voie électronique' }, { sign: '−', text: 'alinéa 4 — renvoi aux délais de grâce du droit national' } ],
        text: ['À peine d\u2019irrecevabilité, les contestations sont portées, devant la juridiction compétente, dans le délai d\u2019un mois à compter de la dénonciation de la saisie au débiteur.', 'En l\u2019absence de contestation, le tiers saisi effectue le paiement sur présentation d\u2019un certificat de non-contestation.'],
        citedCount: 31, top: ['d8', 'd9', 'd10'], citedWith: ['Art. 160, AUPSRVE', 'Art. 164, AUPSRVE', 'Art. 49, AUPSRVE'] },
      a387: { ref: 'Article 387', act: 'AUSCGIE — Acte uniforme relatif au droit des sociétés commerciales et du GIE', label: 'Art. 387, AUSCGIE', current: 'En vigueur · 2014', versions: ['1997'], hl: 0,
        changes: [ { sign: '−', text: 'suppression de la valeur nominale minimale des actions' } ],
        text: ['Le capital social minimum de la société anonyme est fixé à dix millions (10 000 000) de francs CFA. Il est divisé en actions dont le montant nominal est librement fixé par les statuts.'],
        citedCount: 12, top: [], citedWith: ['Art. 388, AUSCGIE', 'Art. 41, AUSCGIE'] },
    };
    const pieces = {
      p1: { title: 'PV de saisie-attribution', meta: 'Pièce n° 4 · versée le 25 juillet 2026 · Me T. Sagna, huissier', hl: 0,
        extract: ['L\u2019an deux mille vingt-quatre et le douze janvier, à la requête de la BICIS, nous, huissier de justice, avons procédé à la saisie-attribution des sommes détenues par la banque tierce saisie pour le compte de la société SODICA.', 'Le tiers saisi a déclaré l\u2019étendue de ses obligations séance tenante ; la présente saisie a été dénoncée au débiteur le même jour.'] },
      p2: { title: 'Bulletins de souscription', meta: 'Pièce n° 2 · versée le 18 juillet 2026', hl: 1,
        extract: ['Souscriptions recueillies : M. A. Ndiaye — 5 000 000 FCFA ; Mme R. Ndiaye — 2 000 000 FCFA ; SCI Almadies — 1 000 000 FCFA.', 'Total des souscriptions : huit millions (8 000 000) de francs CFA, libérées du quart à la signature.'] },
      p3: { title: 'Acte de cautionnement', meta: 'Pièce n° 7 · versée le 1 août 2026', hl: 1,
        extract: ['M. I. Traoré, agissant en qualité de gérant de CIMA Distribution SARL, se porte caution solidaire des engagements souscrits au titre de la convention de crédit du 3 mars 2024.', 'Fait à Abidjan, le 3 mars 2024. Signature : I. Traoré. Aucune mention manuscrite de la somme garantie ne figure à l\u2019acte.'] },
    };
    const AN = {
      auth: { name: 'Vérifier l\u2019autorité', desc: 'Avant de bâtir un moyen sur une solution, voir si la cour l\u2019a jugée une fois ou constamment.' },
      hist: { name: 'Retracer l\u2019historique', desc: 'Les versions d\u2019un texte, et celle qui gouverne à la date des faits.' },
      comp: { name: 'Comparer les versions', desc: 'Les deux rédactions côte à côte, mot à mot, avec ce qui a bougé entre elles.' },
      cite: { name: 'Cartographier les citations', desc: 'La vie d\u2019un article dans les cours : les décisions qui le citent, et les textes qui voyagent avec lui.' },
    };
    const authLines = {
      d8: { title: 'CCJA 090/2018 — art. 170, 335 AUPSRVE', status: 'Ligne jurisprudentielle constante · 4 décisions vérifiées', level: 'constante', article: 'a170',
        rows: [
          { y: '2018', id: 'd8', ref: 'CCJA 090/2018', quote: '« le délai de contestation court de la dénonciation »' },
          { y: '2013', id: 'd9', ref: 'CCJA 001/2013', quote: '« l\u2019article 172 déroge à l\u2019article 49 »' },
          { y: '2010', id: 'd10', ref: 'CCJA 038/2010', quote: '« le délai de l\u2019article 170 est d\u2019ordre public »' },
          { y: '2010', id: 'd11', ref: 'CCJA 025/2010', quote: '« le juge ne peut relever le débiteur forclos »' } ] },
      d1: { title: 'CCJA 084/2018 — art. 45 AUPSRVE', status: 'Ligne jurisprudentielle constante · 3 décisions vérifiées', level: 'constante', article: 'a45',
        rows: [
          { y: '2018', id: 'd1', ref: 'CCJA 084/2018', quote: '« un titre exécutoire constatant une créance liquide et exigible »' },
          { y: '2020', id: 'd2', ref: 'CCJA 156/2020', quote: '« la saisie du compte joint est cantonnée à la quote-part »' },
          { y: '2019', id: 'd7', ref: 'CCJA 012/2019', quote: '« la saisie sans titre exécutoire est nulle »' } ] },
      d4: { title: 'CCJA 031/2021 — art. 14 AUS', status: 'Ligne jurisprudentielle constante · 2 décisions vérifiées', level: 'constante', article: 'a14',
        rows: [
          { y: '2021', id: 'd4', ref: 'CCJA 031/2021', quote: '« à défaut de mention manuscrite, l\u2019engagement est nul »' },
          { y: '2019', id: 'd5', ref: 'CCJA 264/2019', quote: '« la qualité de dirigeant ne dispense pas du formalisme »' } ] },
      d6: { title: 'CCJA 118/2022 — art. 10 AUPSRVE', status: 'Décision isolée · 1 décision vérifiée', level: 'limitee', article: 'a10',
        rows: [ { y: '2022', id: 'd6', ref: 'CCJA 118/2022', quote: '« le délai court du premier acte signifié à personne »' } ] },
    };
    const artHist = {
      a170: { title: 'Art. 170, AUPSRVE', vers: [
          { v: '1998', note: 'Applicable aux procédures engagées avant le 16 février 2024', tag: 'applicable au dossier' },
          { v: '2023', note: 'Art. 170-1 (concordance) — en vigueur depuis le 16 février 2024' } ] },
      a45: { title: 'Art. 45, AUPSRVE', vers: [
          { v: '2017', note: 'Rédaction consolidée d\u2019origine' },
          { v: '2021', note: 'Ajustement des renvois internes' },
          { v: '2024', note: 'Déclaration électronique du tiers saisi admise', tag: 'en vigueur' } ] },
      a14: { title: 'Art. 14, AUS', vers: [
          { v: '1997', note: 'Rédaction initiale — consentement exprès' },
          { v: '2010', note: 'Mention manuscrite exigée à peine de nullité', tag: 'en vigueur' } ] },
      a10: { title: 'Art. 10, AUPSRVE', vers: [
          { v: '1998', note: 'Rédaction initiale' },
          { v: '2024', note: 'Point de départ du délai précisé', tag: 'en vigueur' } ] },
      a387: { title: 'Art. 387, AUSCGIE', vers: [
          { v: '1997', note: 'Rédaction initiale — valeur nominale minimale des actions' },
          { v: '2014', note: 'Valeur nominale librement fixée par les statuts', tag: 'en vigueur' } ] },
    };
    const artComp = {
      a170: { title: 'Art. 170 : 1998 ↔ 2023', governs: 'La rédaction 1998 gouverne les procédures engagées avant le 16 février 2024 — dont le dossier BICIS c/ SODICA.', leftTitle: 'Art. 170 (1998)', rightTitle: 'Art. 170-1 (2023)',
        left: ['À peine d\u2019irrecevabilité, les contestations sont portées, devant la juridiction compétente, dans le délai d\u2019un mois à compter de la dénonciation de la saisie au débiteur.', 'En l\u2019absence de contestation, le tiers saisi effectue le paiement sur présentation d\u2019un certificat de non-contestation.'],
        right: [ { t: 'À peine d\u2019irrecevabilité, les contestations sont portées, devant la juridiction compétente, dans le délai d\u2019un mois à compter de la dénonciation de la saisie au débiteur.' },
          { t: 'La contestation peut être notifiée au créancier et au tiers saisi par voie électronique.', add: true },
          { t: 'En l\u2019absence de contestation, le tiers saisi effectue le paiement sur présentation d\u2019un certificat de non-contestation.' } ],
        changes: [ { sign: '+', text: 'alinéa 2 — notification par voie électronique' }, { sign: '−', text: 'alinéa 4 — renvoi aux délais de grâce du droit national supprimé' } ] },
      a14: { title: 'Art. 14 : 1997 ↔ 2010', governs: 'La rédaction 2010 gouverne les cautionnements conclus depuis son entrée en vigueur.', leftTitle: 'Art. 14 (1997)', rightTitle: 'Art. 14 (2010)',
        left: ['Le cautionnement ne se présume pas. Il doit être convenu de façon expresse entre la caution et le créancier.'],
        right: [ { t: 'Le cautionnement ne se présume pas. Il doit être convenu de façon expresse entre la caution et le créancier.' },
          { t: 'À peine de nullité, l\u2019acte comporte la signature de la caution et la mention, écrite de sa main, de la somme maximale garantie, en toutes lettres et en chiffres.', add: true } ],
        changes: [ { sign: '+', text: 'mention manuscrite de la somme maximale garantie, à peine de nullité' } ] },
      a45: { title: 'Art. 45 : 2021 ↔ 2024', governs: 'La rédaction 2024 est en vigueur depuis le 16 février 2024.', leftTitle: 'Art. 45 (2021)', rightTitle: 'Art. 45 (2024)',
        left: ['Toute personne munie d\u2019un titre exécutoire constatant une créance liquide et exigible peut saisir entre les mains d\u2019un tiers les créances de sommes d\u2019argent appartenant à son débiteur.', 'Le tiers saisi est tenu de déclarer au créancier l\u2019étendue de ses obligations à l\u2019égard du débiteur.'],
        right: [ { t: 'Toute personne munie d\u2019un titre exécutoire constatant une créance liquide et exigible peut saisir entre les mains d\u2019un tiers les créances de sommes d\u2019argent appartenant à son débiteur.' },
          { t: 'Le tiers saisi est tenu de déclarer au créancier l\u2019étendue de ses obligations à l\u2019égard du débiteur. Cette déclaration peut être faite par voie électronique.', add: true } ],
        changes: [ { sign: '+', text: 'déclaration du tiers saisi par voie électronique' }, { sign: '−', text: 'renvoi au droit national des délais de grâce supprimé' } ] },
    };
    const scripted = [
      { keys: ['saisi', 'compte', 'bancaire', 'saisie', 'tiers'],
        answer: 'La saisie d\u2019un compte bancaire est possible par voie de saisie-attribution, à condition que le créancier dispose d\u2019un titre exécutoire constatant une créance liquide et exigible (art. 45, AUPSRVE).\n\nLa CCJA juge de manière constante que le tiers saisi — la banque — doit déclarer sur-le-champ l\u2019étendue de ses obligations envers le débiteur, une déclaration inexacte ou tardive l\u2019exposant aux causes de la saisie. Lorsque le compte est joint, la saisie ne porte que sur la part du débiteur, sauf solidarité établie entre les cotitulaires.',
        authority: { level: 'constante', label: '— jurisprudence constante, 8 décisions CCJA (dernière : 2025)' },
        auths: [ { id: 'd1', note: 'Directement applicable' }, { id: 'd2', note: 'Compte joint' }, { id: 'd3', note: 'Interprétation historique' } ],
        article: 'a45' },
      { keys: ['caution', 'garant', 'sûreté', 'surete', 'manuscrite'],
        answer: 'Le cautionnement ne se présume pas : il doit être constaté par un acte comportant la signature de la caution et la mention, écrite de sa main, de la somme maximale garantie en toutes lettres et en chiffres (art. 14, AUS). À défaut, l\u2019engagement est nul.\n\nLa CCJA applique ce formalisme strictement, y compris lorsque la caution est le dirigeant de la société garantie : la qualité de professionnel averti ne dispense pas de la mention manuscrite.',
        authority: { level: 'constante', label: '— jurisprudence constante, 5 décisions CCJA (dernière : 2021)' },
        auths: [ { id: 'd4', note: 'Directement applicable' }, { id: 'd5', note: 'Caution dirigeante' } ],
        article: 'a14' },
      { keys: ['injonction', 'opposition', 'délai', 'delai', 'payer'],
        answer: 'L\u2019opposition à une ordonnance d\u2019injonction de payer doit être formée dans les quinze jours de la signification, augmentés le cas échéant des délais de distance (art. 10, AUPSRVE).\n\nSur le point de départ du délai en cas de signification à domicile, la CCJA ne s\u2019est prononcée qu\u2019une fois : le délai court du premier acte signifié à personne. Une décision unique fonde cette solution — un élément à peser avant de s\u2019y fier.',
        authority: { level: 'limitee', label: '— autorité limitée, décision unique (CCJA, 2022)' },
        auths: [ { id: 'd6', note: 'Seule décision publiée' } ],
        article: 'a10' },
    ];
    const fallback = {
      answer: 'Sur la base du corpus indexé — actes uniformes OHADA et jurisprudence CCJA publiée — votre question paraît relever, au moins pour partie, du droit national de l\u2019État concerné plutôt que du droit uniforme.\n\nDans la mesure où le droit OHADA s\u2019applique, aucune décision CCJA publiée ne tranche précisément le point posé. Précisez la situation (nature de l\u2019acte, juridiction, date des faits) pour affiner la recherche.',
      authority: { level: 'limitee', label: '— autorité limitée, aucune décision CCJA directement applicable' },
      auths: [], article: null };
    const dossiers = [
      { id: 'v1', name: 'Recouvrement — BICIS c/ SODICA', pieces: '14 pièces', team: ['AD', 'MK', 'SF'], client: 'BICIS',
        placeholder: 'Ex. : Le débiteur peut-il encore contester la saisie ?',
        files: [
          { name: 'PV de saisie-attribution — pièce n° 4.pdf', cat: 'Voie d\u2019exécution', dot: 'var(--red)', date: '25 juil. 2026', size: '810 Ko' },
          { name: 'Titre exécutoire — jugement n° 447.pdf', cat: 'Acte de procédure', dot: 'var(--blue2)', date: '2 août 2026', size: '1,2 Mo' },
          { name: 'Commandement de payer.pdf', cat: 'Acte de procédure', dot: 'var(--blue2)', date: '28 juil. 2026', size: '640 Ko' },
          { name: 'Relevés bancaires SODICA 2025.xlsx', cat: 'Pièce financière', dot: 'var(--green)', date: '20 juil. 2026', size: '2,4 Mo' },
          { name: 'Correspondance banque tiers saisi.docx', cat: 'Correspondance', dot: 'var(--amber)', date: '18 juil. 2026', size: '96 Ko' } ],
        matterQAs: [ {
          keys: ['contester', 'contestation', 'saisie', 'délai', 'delai', 'encore'],
          q: 'Le débiteur peut-il encore contester la saisie ?',
          fact: { text: 'Saisie pratiquée le 12 janvier 2024', src: 'PV de saisie-attribution — pièce n° 4', piece: 'p1' },
          law: 'AUPSRVE 1998 — procédure engagée avant le 16 février 2024',
          authority: { level: 'constante', label: '— jurisprudence constante sur la forclusion de l\u2019art. 170' },
          answer: 'Non, sauf à démontrer un vice affectant la dénonciation elle-même : le délai est expiré.\n\nLa saisie a été pratiquée et dénoncée le 12 janvier 2024 (pièce n° 4). La procédure ayant été engagée avant la révision du 16 février 2024, l\u2019AUPSRVE s\u2019applique dans sa rédaction de 1998 : la contestation devait être portée devant la juridiction compétente dans le délai d\u2019un mois à compter de la dénonciation (art. 170). Ce délai est expiré, et la CCJA juge que le juge ne peut relever le débiteur de cette forclusion : une contestation formée aujourd\u2019hui serait déclarée irrecevable.',
          sources: [
            { k: 'piece', id: 'p1', label: 'PV de saisie-attribution — pièce n° 4', note: 'Fait — date de la saisie et de la dénonciation' },
            { k: 'article', id: 'a170', label: 'Art. 170, AUPSRVE (1998)', note: 'Règle — délai de contestation d\u2019un mois' },
            { k: 'decision', id: 'd8', label: 'CCJA, arrêt n° 090/2018', note: 'Irrecevabilité, pas de relevé de forclusion' } ],
          panel: { type: 'article', id: 'a170' } } ],
        record: [ { mq: 0, user: 'a.diallo', time: 'Il y a 2 h' } ] },
      { id: 'v2', name: 'Constitution SA — Groupe Ndiaye', pieces: '6 pièces', team: ['AD', 'FN'], client: 'Groupe Ndiaye',
        placeholder: 'Ex. : Le capital souscrit permet-il de constituer la SA ?',
        files: [
          { name: 'Projet de statuts SA.docx', cat: 'Société', dot: 'var(--green)', date: '30 juil. 2026', size: '210 Ko' },
          { name: 'Bulletins de souscription — pièce n° 2.pdf', cat: 'Pièce', dot: 'var(--amber)', date: '18 juil. 2026', size: '480 Ko' },
          { name: 'Attestation de dépôt des fonds.pdf', cat: 'Pièce financière', dot: 'var(--green)', date: '15 juil. 2026', size: '160 Ko' } ],
        matterQAs: [ {
          keys: ['capital', 'souscrit', 'constituer', 'sa', 'société', 'societe'],
          q: 'Le capital souscrit permet-il de constituer la SA ?',
          fact: { text: 'Capital souscrit : 8 000 000 FCFA', src: 'Bulletins de souscription — pièce n° 2', piece: 'p2' },
          law: 'AUSCGIE 2014 — droit des sociétés commerciales',
          authority: { level: 'constante', label: '— règle textuelle d\u2019application uniforme' },
          answer: 'Non, en l\u2019état des souscriptions.\n\nLes bulletins versés au dossier (pièce n° 2) totalisent 8 000 000 FCFA, alors que le capital minimum de la société anonyme est fixé à 10 000 000 FCFA (art. 387, AUSCGIE). Il manque 2 000 000 FCFA de souscriptions pour constituer la SA. À défaut de les réunir, la forme de la SAS ou de la SARL — qui ne sont pas soumises à ce minimum — reste ouverte.',
          sources: [
            { k: 'piece', id: 'p2', label: 'Bulletins de souscription — pièce n° 2', note: 'Fait — total souscrit : 8 000 000 FCFA' },
            { k: 'article', id: 'a387', label: 'Art. 387, AUSCGIE', note: 'Règle — capital minimum de 10 000 000 FCFA' } ],
          panel: { type: 'article', id: 'a387' } } ],
        record: [ { mq: 0, user: 'f.ndiaye', time: 'Hier' } ] },
      { id: 'v3', name: 'Sûretés — Financement CIMA', pieces: '21 pièces', team: ['AD', 'MK', 'SF', 'FN'], client: 'CIMA Finance',
        placeholder: 'Ex. : Le cautionnement de M. Traoré est-il valable ?',
        files: [
          { name: 'Acte de cautionnement — pièce n° 7.pdf', cat: 'Sûreté', dot: 'var(--red)', date: '1 août 2026', size: '480 Ko' },
          { name: 'Convention de crédit 2024.pdf', cat: 'Contrat', dot: 'var(--blue2)', date: '22 juil. 2026', size: '1,8 Mo' },
          { name: 'États financiers CIMA 2025.xlsx', cat: 'Pièce financière', dot: 'var(--green)', date: '12 juil. 2026', size: '1,1 Mo' } ],
        matterQAs: [ {
          keys: ['traoré', 'traore', 'cautionnement', 'caution', 'valable'],
          q: 'Le cautionnement de M. Traoré est-il valable ?',
          fact: { text: 'Acte signé sans mention manuscrite de la somme garantie', src: 'Acte de cautionnement — pièce n° 7', piece: 'p3' },
          law: 'AUS 2010 — sûretés personnelles',
          authority: { level: 'constante', label: '— jurisprudence constante, 5 décisions CCJA' },
          answer: 'Non : l\u2019engagement encourt la nullité.\n\nL\u2019acte versé au dossier (pièce n° 7) porte la signature de M. Traoré mais ne comporte pas la mention, écrite de sa main, de la somme maximale garantie en toutes lettres et en chiffres. L\u2019article 14 de l\u2019AUS l\u2019exige à peine de nullité, et la CCJA l\u2019applique strictement — y compris lorsque la caution est le dirigeant de la société garantie (arrêt n° 031/2021).',
          sources: [
            { k: 'piece', id: 'p3', label: 'Acte de cautionnement — pièce n° 7', note: 'Fait — absence de mention manuscrite' },
            { k: 'article', id: 'a14', label: 'Art. 14, AUS', note: 'Règle — formalisme à peine de nullité' },
            { k: 'decision', id: 'd4', label: 'CCJA, arrêt n° 031/2021', note: 'Nullité confirmée, caution dirigeante' } ],
          panel: { type: 'article', id: 'a14' } } ],
        record: [ { mq: 0, user: 'm.kone', time: '2 août' } ] },
    ];
    const guides = [
      { title: 'Lire le signal d\u2019autorité', tag: 'Fiabilité', body: [
        'Chaque réponse de Claidor est accompagnée d\u2019un signal d\u2019autorité : il indique si la solution repose sur une jurisprudence constante ou sur une décision isolée.',
        'Un point vert signale une jurisprudence constante — plusieurs décisions CCJA concordantes, avec la dernière en date. Un point ambre signale une autorité limitée : décision unique, ancienne, ou absence de décision directement applicable.',
        'Le signal n\u2019est pas une conclusion juridique : il mesure le poids du fondement, pas la justesse de la réponse. Ouvrez toujours les sources classées sous la réponse avant de plaider.' ] },
      { title: 'Faits du dossier et règles du corpus', tag: 'Dossiers', body: [
        'Les réponses de Claidor tournent souvent sur des détails de fait : la date d\u2019un acte, la juridiction saisie, les sommes en cause. Ces détails sont dans les pièces du dossier — Claidor les lit au lieu de vous les demander.',
        'Dans une réponse de dossier, chaque affirmation est étiquetée : un fait tiré d\u2019une pièce est marqué « Pièce », une règle tirée d\u2019un texte est marquée « Article ». Vous savez toujours ce qui repose sur le dossier et ce qui repose sur le droit.',
        'Le bloc « Fait retenu / Droit applicable » en tête de réponse résume ce croisement : le dossier fournit les faits, le corpus fournit la règle — et la version du texte est choisie d\u2019après la date des faits.' ] },
      { title: 'Lancer une analyse depuis ce que vous lisez', tag: 'Analyses', body: [
        'Les analyses sont des questions nommées : vérifier l\u2019autorité d\u2019une décision, retracer l\u2019historique d\u2019un article, comparer deux versions, cartographier les citations.',
        'Elles se lancent depuis l\u2019endroit où vous êtes : une décision ouverte propose « Vérifier l\u2019autorité » sur cette décision ; un article ouvert propose son historique, sa comparaison et ses citations.',
        'Chaque résultat se termine par « Analyses suivantes » : une analyse mène à l\u2019autre, et le raisonnement reste au même endroit au lieu de repartir de zéro à chaque question.' ] },
      { title: 'Bien formuler une question', tag: 'Méthode', body: [
        'Claidor répond mieux aux questions qui précisent l\u2019acte concerné, la juridiction et, si possible, la date des faits.',
        'Rattachez la question à un dossier (« Choisir un dossier ») : les pièces du dossier servent de contexte et la recherche est journalisée pour l\u2019équipe de l\u2019affaire.',
        'Le bouton « Améliorer » restructure votre question en y ajoutant le contexte du dossier et les précisions attendues (sources, autorité, version applicable).' ] },
    ];
    const prompts = [
      { title: 'Analyse d\u2019autorité', text: 'Quelle est l\u2019autorité de la jurisprudence CCJA sur [point de droit] ? Indiquer le nombre de décisions, la dernière en date et les divergences éventuelles.' },
      { title: 'Vérification de formalisme', text: 'Contrôler la validité formelle de [acte] au regard de l\u2019acte uniforme applicable, en citant l\u2019article et les décisions pertinentes.' },
      { title: 'Historique d\u2019un article', text: 'Retracer les versions de l\u2019article [n°] de l\u2019[acte uniforme], les modifications apportées et la version applicable à des faits de [date].' },
    ];
    const sourcesDef = [
      { id: 'au', label: 'Actes uniformes', color: 'var(--blue)', d: 'M8 2.5C6.5 1.6 4.5 1.4 2.5 1.4v11.2c2 0 4 0.2 5.5 1.1 1.5-0.9 3.5-1.1 5.5-1.1V1.4c-2 0-4 0.2-5.5 1.1zM8 2.5v11.2' },
      { id: 'cj', label: 'Jurisprudence CCJA', color: 'var(--red)', d: 'M8 2v11M5 13h6M8 3.5L3.5 5M8 3.5L12.5 5M3.5 5l-1.8 4a2.3 2.3 0 003.6 0zM12.5 5l-1.8 4a2.3 2.3 0 003.6 0z' },
      { id: 'jo', label: 'Journal officiel', color: 'var(--green)', d: 'M3 1.5h7L13 4.5v10H3zM10 1.5v3h3M5.5 8h5M5.5 10.5h5' },
      { id: 'dn', label: 'Droit national', color: 'var(--amber)', d: 'M2 14h12M3 6.5h10M4.5 6.5V12M8 6.5V12M11.5 6.5V12M8 1.5L13.5 6.5H2.5z' },
      { id: 'web', label: 'Recherche web', color: 'var(--teal)', d: 'M8 14.5A6.5 6.5 0 118 1.5a6.5 6.5 0 010 13zM1.5 8h13M8 1.5c1.8 1.7 2.8 4 2.8 6.5S9.8 13.3 8 14.5C6.2 12.8 5.2 10.5 5.2 8S6.2 3.2 8 1.5z' },
    ];
    const clients = ['BICIS', 'Groupe Ndiaye', 'CIMA Finance'];
    const seededHist = [
      { q: 'Le débiteur peut-il encore contester la saisie ?', user: 'a.diallo@diallo-associes.com', time: 'Il y a 2 h', dossierId: 'v1' },
      { q: 'Peut-on saisir un compte bancaire dans cette situation ?', user: 'm.kone@diallo-associes.com', time: 'Hier' },
      { q: 'Le capital souscrit permet-il de constituer la SA ?', user: 'f.ndiaye@diallo-associes.com', time: 'Hier', dossierId: 'v2' },
      { q: 'Le cautionnement de M. Traoré est-il valable ?', user: 'm.kone@diallo-associes.com', time: '2 août', dossierId: 'v3' },
    ];
    const convs = [
      { id: 'c1', title: 'Contestation de la saisie — SODICA', q: 'Le débiteur peut-il encore contester la saisie ?', dossierId: 'v1' },
      { id: 'c2', title: 'Formalisme du cautionnement', q: 'Un cautionnement sans mention manuscrite est-il valable ?' },
      { id: 'c3', title: 'Délai d\u2019opposition — injonction de payer', q: 'Quel est le délai d\u2019opposition à une injonction de payer ?' },
    ];
    const qByArticle = { a45: 'Peut-on saisir un compte bancaire dans cette situation ?', a14: 'Un cautionnement sans mention manuscrite est-il valable ?', a10: 'Quel est le délai d\u2019opposition à une injonction de payer ?' };
    const shortRef = { d1: 'CCJA 084/2018', d2: 'CCJA 156/2020', d3: 'CCJA 027/2015', d4: 'CCJA 031/2021', d5: 'CCJA 264/2019', d6: 'CCJA 118/2022', d7: 'CCJA 012/2019', d8: 'CCJA 090/2018', d9: 'CCJA 001/2013', d10: 'CCJA 038/2010', d11: 'CCJA 025/2010' };
    const sums = {
      d8: { arg: 'Le débiteur soutenait que sa contestation, formée après le délai d\u2019un mois, restait recevable.', held: 'Irrecevabilité — le juge ne peut relever le débiteur de la forclusion.', arts: 'Art. 170, 335 AUPSRVE' },
      d9: { arg: 'Compétence disputée entre le juge de l\u2019art. 49 et celui de l\u2019art. 170.', held: 'L\u2019article 172 déroge à l\u2019article 49 : la contestation relève du juge de l\u2019art. 170.', arts: 'Art. 49, 170, 172 AUPSRVE' },
      d10: { arg: 'Le débiteur invoquait la suspension du délai par sa réclamation adressée au créancier.', held: 'Le délai de l\u2019art. 170 est d\u2019ordre public — ni suspendu ni interrompu.', arts: 'Art. 170 AUPSRVE' },
      d11: { arg: 'Demande de relevé de forclusion pour une contestation tardive.', held: 'Aucun relevé possible : la contestation tardive est irrecevable.', arts: 'Art. 170 AUPSRVE' },
      d1: { arg: 'La banque contestait la validité du titre fondant la saisie et sa propre responsabilité.', held: 'Titre exécutoire régulier ; le tiers saisi répond de sa déclaration inexacte.', arts: 'Art. 45, 156 AUPSRVE' },
      d2: { arg: 'Étendue de la saisie pratiquée sur un compte joint.', held: 'La saisie est cantonnée à la quote-part du débiteur, sauf solidarité établie.', arts: 'Art. 45 AUPSRVE' },
      d4: { arg: 'Le créancier soutenait que la caution, dirigeant averti, ne pouvait invoquer le défaut de mention.', held: 'Nullité — la mention manuscrite s\u2019impose même au dirigeant.', arts: 'Art. 14 AUS' },
      d6: { arg: 'Point de départ du délai d\u2019opposition en cas de signification à domicile.', held: 'Le délai court du premier acte signifié à personne.', arts: 'Art. 10 AUPSRVE' },
    };
    const similars = { d8: ['d9', 'd10', 'd11'], d9: ['d8', 'd10'], d10: ['d8', 'd11'], d11: ['d8', 'd10'], d1: ['d2', 'd7'], d2: ['d1', 'd7'], d7: ['d1'], d4: ['d5'], d5: ['d4'] };
    const readerDoc = { name: 'Conclusions adverses — SODICA c/ BICIS.pdf', meta: '9 pages · 6 références détectées et vérifiées', findings: [
      { cite: 'Art. 49, AUPSRVE', status: 'weak', k: 'decision', id: 'd9', note: 'Point faible — depuis CCJA 001/2013, l\u2019article 172 déroge à l\u2019article 49 : la contestation de la saisie-attribution relève du juge de l\u2019art. 170.' },
      { cite: 'Art. 170, AUPSRVE (2023)', status: 'weak', k: 'article', id: 'a170', note: 'Mauvaise version — la procédure a été engagée avant le 16 février 2024 : la rédaction 1998 gouverne ce dossier.' },
      { cite: 'CCJA 118/2022', status: 'warn', k: 'decision', id: 'd6', note: 'Autorité limitée — décision isolée, seule publiée sur son point.' },
      { cite: 'CCJA 027/2015', status: 'warn', k: 'decision', id: 'd3', note: 'Interprétation historique — rendue sous une rédaction antérieure du texte.' },
      { cite: 'CCJA 090/2018', status: 'ok', k: 'decision', id: 'd8', note: 'Vérifiée — ligne jurisprudentielle constante, citation exacte.' },
      { cite: 'Art. 45, AUPSRVE', status: 'ok', k: 'article', id: 'a45', note: 'Vérifié — texte en vigueur, correctement cité.' },
    ] };
    const alertFeed = [
      { when: 'Ce matin', text: 'Nouvelle décision CCJA citant l\u2019art. 170 — 2e chambre, forclusion confirmée', k: 'decision', id: 'd8' },
      { when: '12 juil.', text: 'Révision de l\u2019AUPSRVE publiée au JO — comparer les rédactions 1998 et 2023', an: ['comp', 'a170'] },
      { when: '28 juin', text: 'Nouvelle décision CCJA citant l\u2019art. 14 — cautionnement du dirigeant', k: 'decision', id: 'd4' },
    ];
    this._d = { K, decisions, articles, pieces, AN, authLines, artHist, artComp, scripted, fallback, dossiers, guides, prompts, sourcesDef, clients, seededHist, convs, qByArticle, shortRef, sums, similars, readerDoc, alertFeed };
    return this._d;
  }

  componentDidUpdate() {
    if (this._sc && this.state.streamingIdx >= 0) this._sc.scrollTop = this._sc.scrollHeight;
  }
  componentWillUnmount() { clearInterval(this._t); clearTimeout(this._toastT); }

  matchGeneral(q) {
    const D = this.data(); const ql = q.toLowerCase();
    return D.scripted.find(x => x.keys.some(k => ql.includes(k))) || D.fallback;
  }
  matchMatter(q, dossierId) {
    const d = this.data().dossiers.find(x => x.id === dossierId);
    if (!d) return null;
    const ql = q.toLowerCase();
    return d.matterQAs.find(m => m.keys.some(k => ql.includes(k))) || d.matterQAs[0];
  }
  authLineFor(decisionId) {
    const AL = this.data().authLines;
    if (AL[decisionId]) return decisionId;
    return Object.keys(AL).find(k => AL[k].rows.some(r => r.id === decisionId)) || null;
  }
  showToast(msg) {
    clearTimeout(this._toastT);
    this.setState({ toast: msg });
    this._toastT = setTimeout(() => this.setState({ toast: '' }), 2200);
  }
  prep(answer) {
    let a = answer;
    if (this.state.concise) a = a.split('\n\n')[0];
    if (this.state.deep) a = 'Recherche approfondie — corpus élargi (actes uniformes, jurisprudence CCJA, doctrine indexée).\n\n' + a;
    return a;
  }
  buildMsg(q, dossierId) {
    if (dossierId) {
      const mq = this.matchMatter(q, dossierId);
      if (mq) return { role: 'assistant', answer: this.prep(mq.answer), authority: mq.authority, fact: mq.fact, law: mq.law,
        sources: mq.sources, panel: mq.panel, done: false };
    }
    const s = this.matchGeneral(q);
    const sources = (s.auths || []).map(a => ({ k: 'decision', id: a.id, label: this.data().decisions[a.id].title, note: a.note }));
    if (s.article) sources.push({ k: 'article', id: s.article, label: this.data().articles[s.article].label, note: 'Texte en vigueur · versions · citations' });
    return { role: 'assistant', answer: this.prep(s.answer), authority: s.authority, sources,
      panel: s.article ? { type: 'article', id: s.article } : null, done: false };
  }

  send(text, dIdOverride) {
    const q = (text != null ? text : this.state.input).trim();
    if (!q) return;
    const dId = dIdOverride === undefined ? this.state.dossierSelId : dIdOverride;
    const am = this.buildMsg(q, dId);
    const msgs = [...this.state.messages, { role: 'user', text: q }, am];
    let conv = this.state.activeConv, extra = this.state.extraConvs;
    if (!conv) {
      conv = 'x' + Date.now();
      extra = [{ id: conv, title: q.length > 40 ? q.slice(0, 40) + '…' : q, q, dossierId: dId }, ...extra];
    }
    const hist = [{ q, user: 'a.diallo@diallo-associes.com', time: 'À l\u2019instant', dossierId: dId }, ...this.state.hist];
    clearInterval(this._t);
    this.setState({ view: 'assistant', chat: true, input: '', messages: msgs, activeConv: conv, extraConvs: extra, revealed: 0, streamingIdx: msgs.length - 1, panel: null, menu: null, hist });
    this.stream(am.answer, am.panel);
  }
  stream(answer, panelSpec) {
    const full = answer.length;
    const cps = Math.max(1, Math.round(this.props.streamSpeed ?? 4)) * 50;
    const start = Date.now();
    this._t = setInterval(() => {
      const r = Math.floor((Date.now() - start) / 1000 * cps);
      if (r >= full) {
        clearInterval(this._t);
        this.setState(st => {
          const m = st.messages.slice();
          if (st.streamingIdx >= 0) m[st.streamingIdx] = { ...m[st.streamingIdx], done: true };
          return { revealed: full, messages: m, streamingIdx: -1, panel: panelSpec || st.panel };
        });
        return;
      }
      this.setState({ revealed: r });
    }, 30);
  }
  regen(i) {
    const m = this.state.messages[i];
    if (!m || this.state.streamingIdx >= 0) return;
    clearInterval(this._t);
    const msgs = this.state.messages.slice();
    msgs[i] = { ...m, done: false };
    this.setState({ messages: msgs, revealed: 0, streamingIdx: i, panel: null });
    this.stream(m.answer, m.panel);
  }
  openQA(q, dossierId) {
    const D = this.data();
    const am = this.buildMsg(q, dossierId);
    am.done = true;
    const d = dossierId ? D.dossiers.find(x => x.id === dossierId) : null;
    clearInterval(this._t);
    this.setState({ view: 'assistant', chat: true, input: '', streamingIdx: -1, revealed: 0, menu: null,
      activeConv: null, panel: am.panel,
      dossierSel: d ? d.name : this.state.dossierSel, dossierSelId: dossierId || this.state.dossierSelId,
      clientSel: d ? d.client : this.state.clientSel,
      messages: [ { role: 'user', text: q }, am ] });
  }
  openAnalysis(type, id) {
    this.nav('analysis', { an: { type, id }, panel: null });
  }
  nav(view, patch) {
    clearInterval(this._t);
    this.setState(Object.assign({ view, menu: null, searchOpen: false, streamingIdx: -1 }, patch || {}));
  }
  askFromDossier() {
    const d = this.data().dossiers.find(x => x.id === this.state.dossier);
    if (!d) return;
    const q = this.state.input.trim() || d.matterQAs[0].q;
    this.setState({ dossierSel: d.name, dossierSelId: d.id, clientSel: d.client });
    this.send(q, d.id);
  }
  toggleVeille(id, label) {
    const vs = this.state.veilles.slice();
    const i = vs.findIndex(v => v.id === id);
    if (i >= 0) { vs[i] = { ...vs[i], on: !vs[i].on }; this.showToast(vs[i].on ? 'Veille réactivée' : 'Veille suspendue'); }
    else { vs.unshift({ id, label, sub: 'Nouvelle décision · révision du texte', on: true, last: '—' }); this.showToast('Veille créée — vous serez prévenu par courriel'); }
    this.setState({ veilles: vs });
  }

  renderVals() {
    const D = this.data();
    const st = this.state;
    if (this.state.dark === undefined) {
      let dark = false;
      try { dark = localStorage.getItem('claidor-dark') === '1'; } catch (e) {}
      if (dark) document.documentElement.setAttribute('data-claidor-dark', '');
      this.state.dark = dark;
    }
    if (!this._greeting) {
      const gs = ['What are we working on today?', 'What legal question can I help with?', "What's on your desk today?", 'Where should we begin?', "What's the matter at hand?"];
      this._greeting = gs[Math.floor(Math.random() * gs.length)];
    }
    const showAuth = this.props.showAuthoritySignal ?? true;
    const showNotes = st.notes;
    const openPanel = p => () => this.setState({ panel: p });
    const chColor = ch => ({ ...ch, color: ch.sign === '+' ? 'var(--green2)' : 'var(--red2)' });
    const msgs = st.messages.map((m, i) => {
      if (m.role === 'user') return { isUser: true, isAssistant: false, text: m.text };
      const streaming = i === st.streamingIdx;
      const level = m.authority && m.authority.level;
      return {
        isUser: false, isAssistant: true,
        text: streaming ? m.answer.slice(0, st.revealed) : m.answer,
        showCursor: streaming,
        hasFact: !!m.done && !!m.fact,
        factText: m.fact ? m.fact.text : '', factSrc: m.fact ? '→ ' + m.fact.src : '',
        factOpen: m.fact ? openPanel({ type: 'piece', id: m.fact.piece }) : null,
        law: m.law || '',
        showAuth: !!m.done && showAuth && !!m.authority,
        authLabel: m.authority ? m.authority.label : '',
        authDot: level === 'constante' ? 'var(--green2)' : 'var(--amber2)',
        hasSources: !!m.done && m.sources && m.sources.length > 0,
        sources: (m.sources || []).map(s => ({
          kind: D.K[s.k].kind, color: D.K[s.k].color, d: D.K[s.k].d,
          label: s.label, note: showNotes ? s.note : '',
          open: openPanel({ type: s.k === 'piece' ? 'piece' : (s.k === 'article' ? 'article' : 'decision'), id: s.id }) })),
        copy: () => { try { navigator.clipboard.writeText(m.answer); } catch (e) {} this.showToast('Réponse copiée'); },
        exportIt: () => this.showToast('Export PDF ajouté à la file'),
        regen: () => this.regen(i),
      };
    });
    const convs = [...st.extraConvs, ...D.convs].map(c => ({
      title: c.title,
      bg: c.id === st.activeConv ? 'var(--s8)' : 'transparent',
      open: () => this.openQA(c.q, c.dossierId),
    }));
    const dossierIconD = 'M1.5 4.5a2 2 0 012-2h3l1.5 2h4.5a2 2 0 012 2v5a2 2 0 01-2 2h-9a2 2 0 01-2-2z';
    const clientIconD = 'M1.5 4.5h13v9h-13zM5.5 4.5V3a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0110.5 3v1.5';
    const contextChips = [];
    if (st.dossierSel) contextChips.push({ label: st.dossierSel, d: dossierIconD, remove: () => this.setState({ dossierSel: null, dossierSelId: null }) });
    if (st.clientSel) contextChips.push({ label: 'Client · ' + st.clientSel, d: clientIconD, remove: () => this.setState({ clientSel: null }) });
    const sources = D.sourcesDef.map(s => {
      const on = !!st.selSources[s.id];
      return { label: s.label, color: s.color, d: s.d,
        border: on ? 'var(--accent)' : 'var(--b2)',
        plus: on ? '✓' : '+', plusColor: on ? 'var(--accent)' : 'var(--t4)', plusFw: on ? 700 : 400,
        toggle: () => { const sel = { ...st.selSources }; if (on) delete sel[s.id]; else sel[s.id] = true; this.setState({ selSources: sel }); this.showToast(on ? s.label + ' retiré des sources' : s.label + ' ajouté aux sources'); } };
    });
    const analysisCards = [
      { title: D.AN.auth.name, meta: 'CCJA 090/2018', open: () => this.openAnalysis('auth', 'd8') },
      { title: D.AN.hist.name, meta: 'Art. 170, AUPSRVE', open: () => this.openAnalysis('hist', 'a170') },
      { title: D.AN.comp.name, meta: 'Art. 170 : 1998 ↔ 2023', open: () => this.openAnalysis('comp', 'a170') },
      { title: D.AN.cite.name, meta: 'Art. 45, AUPSRVE', open: () => this.openAnalysis('cite', 'a45') },
    ];
    const analysisList = [
      { type: 'auth', targets: [['d8', 'CCJA 090/2018'], ['d1', 'CCJA 084/2018'], ['d6', 'CCJA 118/2022']] },
      { type: 'hist', targets: [['a170', 'Art. 170, AUPSRVE'], ['a45', 'Art. 45, AUPSRVE'], ['a14', 'Art. 14, AUS']] },
      { type: 'comp', targets: [['a170', 'Art. 170 : 1998 ↔ 2023'], ['a14', 'Art. 14 : 1997 ↔ 2010'], ['a45', 'Art. 45 : 2021 ↔ 2024']] },
      { type: 'cite', targets: [['a45', 'Art. 45, AUPSRVE'], ['a170', 'Art. 170, AUPSRVE'], ['a14', 'Art. 14, AUS']] },
    ].map(x => ({ title: D.AN[x.type].name, desc: D.AN[x.type].desc,
      targets: x.targets.map(t => ({ label: t[1], go: () => this.openAnalysis(x.type, t[0]) })) }));
    const dossierCards = D.dossiers.map(d => ({ name: d.name, pieces: d.pieces, team: d.team, open: () => this.nav('dossierDetail', { dossier: d.id, input: '' }) }));
    const dossierMenu = D.dossiers.map(d => ({ name: d.name, meta: d.pieces + ' · ' + d.team.length + ' avocats', pick: () => { this.setState({ dossierSel: d.name, dossierSelId: d.id, clientSel: d.client, menu: null }); this.showToast('Dossier rattaché — Claidor lira ses pièces'); } }));
    const clientMenu = D.clients.map(name => ({ name, pick: () => this.setState({ clientSel: name, menu: null }) }));
    const promptMenu = D.prompts.map(p => ({ title: p.title, text: p.text, use: () => this.setState({ input: p.text, menu: null }) }));
    const promptRows = D.prompts.map(p => ({ title: p.title, text: p.text, use: () => this.nav('assistant', { chat: false, input: p.text }) }));
    const histRows = [...st.hist, ...D.seededHist].map(h => ({ q: h.q, type: h.dossierId ? 'Dossier' : 'Recherche', user: h.user, time: h.time, open: () => this.openQA(h.q, h.dossierId) }));
    const guideList = D.guides.map((g, i) => ({ title: g.title, tag: g.tag, bg: i === st.guide ? 'var(--s8)' : 'transparent', open: () => this.setState({ guide: i }) }));
    const gg = D.guides[st.guide];
    let dd = null;
    if (st.dossier) {
      const d = D.dossiers.find(x => x.id === st.dossier);
      dd = { ...d,
        record: d.record.map(r => ({ q: d.matterQAs[r.mq].q, user: r.user, time: r.time, open: () => this.openQA(d.matterQAs[r.mq].q, d.id) })) };
    }
    let an = null, anIsAuth = false, anIsHist = false, anIsComp = false, anIsCite = false;
    if (st.an) {
      const t = st.an.type, id = st.an.id;
      const nextFor = artId => {
        const out = [];
        if (artId) {
          if (t !== 'hist' && D.artHist[artId]) out.push({ label: D.AN.hist.name, go: () => this.openAnalysis('hist', artId) });
          if (t !== 'comp' && D.artComp[artId]) out.push({ label: D.AN.comp.name, go: () => this.openAnalysis('comp', artId) });
          if (t !== 'cite' && D.articles[artId]) out.push({ label: D.AN.cite.name, go: () => this.openAnalysis('cite', artId) });
          if (t !== 'auth') {
            const topD = (D.articles[artId].top || [])[0];
            const line = topD ? this.authLineFor(topD) : null;
            if (line) out.push({ label: D.AN.auth.name, go: () => this.openAnalysis('auth', line) });
          }
        }
        return out;
      };
      if (t === 'auth') {
        anIsAuth = true;
        const L = D.authLines[id];
        an = { kind: D.AN.auth.name, title: L.title, hasStatus: true, status: L.status,
          dot: L.level === 'constante' ? 'var(--green2)' : 'var(--amber2)',
          rows: L.rows.map(r => ({ ...r, open: openPanel({ type: 'decision', id: r.id }) })),
          next: nextFor(L.article) };
      } else if (t === 'hist') {
        anIsHist = true;
        const H = D.artHist[id];
        an = { kind: D.AN.hist.name, title: H.title, hasStatus: false,
          vers: H.vers.map(v => ({ ...v, hasTag: !!v.tag })),
          changes: (D.articles[id].changes || []).map(chColor),
          next: nextFor(id) };
      } else if (t === 'comp') {
        anIsComp = true;
        const C = D.artComp[id];
        an = { kind: D.AN.comp.name, title: C.title, hasStatus: !!C.governs, status: C.governs || '', dot: 'var(--blue)',
          leftTitle: C.leftTitle, rightTitle: C.rightTitle,
          left: C.left,
          right: C.right.map(p => ({ text: p.t, bg: p.add ? 'var(--greenbg)' : 'transparent', pad: p.add ? '8px 10px' : '0' })),
          changes: C.changes.map(chColor),
          next: nextFor(id) };
      } else {
        anIsCite = true;
        const A = D.articles[id];
        an = { kind: D.AN.cite.name, title: A.label + ' — cité dans ' + A.citedCount + ' décisions vérifiées', hasStatus: false,
          citedWith: A.citedWith,
          rows: A.top.map(did => ({ ref: D.decisions[did].title, open: openPanel({ type: 'decision', id: did }) })),
          next: nextFor(id) };
      }
    }
    const veilleRows = st.veilles.map((v, i) => ({ label: v.label, sub: v.sub, last: v.last,
      bg: v.on ? '#2897FF' : 'var(--b5)', knob: v.on ? '15px' : '2px',
      toggle: () => { const vs = st.veilles.slice(); vs[i] = { ...v, on: !v.on }; this.setState({ veilles: vs }); } }));
    const alertRows = D.alertFeed.map(a => ({ when: a.when, text: a.text,
      open: () => { if (a.an) this.openAnalysis(a.an[0], a.an[1]); else this.setState({ view: 'veilles', panel: { type: a.k, id: a.id } }); } }));
    const stTag = { ok: ['var(--green2)', 'Vérifiée'], warn: ['var(--amber2)', 'À vérifier'], weak: ['var(--red2)', 'Point faible'] };
    const readerFindings = D.readerDoc.findings.map(f => ({ cite: f.cite, note: f.note,
      dot: stTag[f.status][0], tag: stTag[f.status][1],
      open: openPanel({ type: f.k === 'article' ? 'article' : 'decision', id: f.id }) }));
    const normTxt = s => s.toLowerCase().replace(/article\s/g, 'art. ').replace(/\s+/g, ' ').trim();
    const tokens = normTxt(st.searchQ || '').split(' ').filter(Boolean);
    const matOf = a0 => a0 === 'a14' ? 'Cautionnement' : (a0 === 'a10' ? 'Injonction de payer' : (a0 === 'a387' ? 'Sociétés' : 'Saisie-attribution'));
    const docs = [];
    Object.keys(D.decisions).forEach(id => { const d = D.decisions[id];
      docs.push({ kind: 'Décision', label: D.shortRef[id] || d.title, meta: d.title + ' · ' + matOf(d.articles[0]),
        year: parseInt((d.title.match(/\d{4}/) || ['0'])[0], 10), ch: (d.title.match(/1re ch\.|2e ch\.|3e ch\.|ass\. plén\./) || [''])[0],
        mat: matOf(d.articles[0]), open: openPanel({ type: 'decision', id }) }); });
    Object.keys(D.articles).forEach(id => { const a = D.articles[id];
      docs.push({ kind: 'Article', label: a.label, meta: a.act, year: 0, ch: '', mat: matOf(id), open: openPanel({ type: 'article', id }) }); });
    const rescResults = docs.filter(dc => {
      const hay = normTxt(dc.label + ' ' + dc.meta);
      if (tokens.length && !tokens.every(t => hay.includes(t))) return false;
      if (st.fMat && dc.mat !== st.fMat) return false;
      if (st.fSince && (dc.kind !== 'Décision' || dc.year < st.fSince)) return false;
      if (st.fCh && (dc.kind !== 'Décision' || dc.ch !== st.fCh)) return false;
      return true;
    });
    const mkChip = (label, key, val) => ({ label,
      border: st[key] === val ? 'var(--accent)' : 'var(--b3)', bg: st[key] === val ? 'var(--accent)' : 'var(--on-accent)', color: st[key] === val ? 'var(--on-accent)' : 'var(--t1)',
      pick: () => this.setState({ [key]: st[key] === val ? null : val }) });
    const fMatChips = ['Saisie-attribution', 'Cautionnement', 'Injonction de payer', 'Sociétés'].map(m => mkChip(m, 'fMat', m));
    const fSinceChips = [2010, 2015, 2020].map(y => mkChip('Depuis ' + y, 'fSince', y));
    const fChChips = ['1re ch.', '2e ch.', '3e ch.'].map(c => mkChip(c, 'fCh', c));
    const all = [
      ...['d8', 'd1', 'd4', 'd6', 'd9'].map(id => ({ kind: 'Document', label: D.shortRef[id] + ' — ' + D.decisions[id].title, go: () => this.nav('recherche', { panel: { type: 'decision', id } }) })),
      ...['a170', 'a45', 'a14', 'a10'].map(id => ({ kind: 'Document', label: D.articles[id].label, go: () => this.nav('recherche', { panel: { type: 'article', id } }) })),
      ...D.dossiers.map(d => ({ kind: 'Dossier', label: d.name, go: () => this.nav('dossierDetail', { dossier: d.id, input: '' }) })),
      { kind: 'Analyse', label: D.AN.auth.name + ' — CCJA 090/2018', go: () => this.openAnalysis('auth', 'd8') },
      { kind: 'Analyse', label: D.AN.hist.name + ' — Art. 170', go: () => this.openAnalysis('hist', 'a170') },
      { kind: 'Analyse', label: D.AN.comp.name + ' — Art. 170', go: () => this.openAnalysis('comp', 'a170') },
      { kind: 'Analyse', label: D.AN.cite.name + ' — Art. 45', go: () => this.openAnalysis('cite', 'a45') },
      ...Object.keys(D.qByArticle).map(id => ({ kind: 'Article', label: D.articles[id].label, go: () => this.openQA(D.qByArticle[id]) })),
      ...D.convs.map(c => ({ kind: 'Recherche', label: c.title, go: () => this.openQA(c.q, c.dossierId) })),
      ...D.guides.map((g, i) => ({ kind: 'Guide', label: g.title, go: () => this.nav('guides', { guide: i }) })),
    ];
    const searchResults = (tokens.length ? all.filter(r => { const h = normTxt(r.label); return tokens.every(t => h.includes(t)); }) : all).slice(0, 9);
    const canSend = st.input.trim().length > 0;
    const isChatView = st.view === 'assistant' && st.chat;
    const isAnalysisView = st.view === 'analysis';
    return {
      greeting: this._greeting,
      isDark: !!st.dark, isLight: !st.dark,
      themeTitle: st.dark ? 'Mode clair' : 'Mode sombre',
      toggleDark: () => this.setState(s => {
        const dark = !s.dark;
        if (dark) document.documentElement.setAttribute('data-claidor-dark', ''); else document.documentElement.removeAttribute('data-claidor-dark');
        try { localStorage.setItem('claidor-dark', dark ? '1' : '0'); } catch (e) {}
        return { dark };
      }),
      isWelcome: st.view === 'assistant' && !st.chat,
      isChat: isChatView,
      isAnalysesList: st.view === 'analyses',
      isAnalysis: isAnalysisView,
      isDossiersList: st.view === 'dossiers',
      isDossierDetail: st.view === 'dossierDetail',
      isRecherche: st.view === 'recherche',
      isVeilles: st.view === 'veilles',
      isLecteur: st.view === 'lecteur',
      isHistorique: st.view === 'historique',
      isBiblio: st.view === 'biblio',
      isGuides: st.view === 'guides',
      ...(() => { const navOn = {
        Assistant: st.view === 'assistant',
        Dossiers: st.view === 'dossiers' || st.view === 'dossierDetail',
        Analyses: st.view === 'analyses' || st.view === 'analysis',
        Recherche: st.view === 'recherche',
        Veilles: st.view === 'veilles',
        Lecteur: st.view === 'lecteur',
        Historique: st.view === 'historique',
        Biblio: st.view === 'biblio',
        Guides: st.view === 'guides' };
        const o = {};
        Object.keys(navOn).forEach(k => { const on = navOn[k];
          o['bg' + k] = on ? 'var(--s8)' : 'transparent';
          o['fw' + k] = on ? 600 : 400;
          o['c' + k] = 'var(--ink)';
          o['ic' + k] = k === 'Assistant' ? 'var(--t1)' : 'var(--t2)'; });
        return o; })(),
      goAssistant: () => this.nav('assistant'),
      goDossiers: () => this.nav('dossiers', { dossier: null }),
      goAnalyses: () => this.nav('analyses', { an: null }),
      goVeilles: () => this.nav('veilles', { panel: null }),
      goLecteur: () => this.nav('lecteur', { panel: null }),
      openRecherche: () => this.nav('recherche', { panel: null }),
      goHistorique: () => this.nav('historique'),
      goBiblio: () => this.nav('biblio'),
      goGuides: () => this.nav('guides'),
      msgs, convs, analysisCards, analysisList, dossierCards, dossierMenu, clientMenu, promptMenu, promptRows, histRows, guideList, gg, dd,
      an, anIsAuth, anIsHist, anIsComp, anIsCite,
      veilleRows, alertRows, readerFindings, fMatChips, fSinceChips, fChChips, rescResults,
      rescCount: rescResults.length + (rescResults.length > 1 ? ' documents' : ' document'),
      readerName: D.readerDoc.name, readerMeta: D.readerDoc.meta,
      readerIdle: !st.readerDone, readerDone: st.readerDone,
      runReader: () => this.setState({ readerDone: true, panel: null }),
      resetReader: () => this.setState({ readerDone: false, panel: null }),
      input: st.input, contextChips, hasContext: contextChips.length > 0, hasChatContext: contextChips.length > 0 && st.messages.length > 0,
      sources,
      dossierBtnLabel: st.dossierSel ? st.dossierSel : 'Choisir un dossier',
      clientBtnLabel: st.clientSel ? 'Client · ' + st.clientSel : 'Définir le client',
      menuIsDossier: st.menu === 'dossier', menuIsClient: st.menu === 'client', menuIsPrompts: st.menu === 'prompts', menuIsCustom: st.menu === 'custom',
      toggleDossierMenu: () => this.setState({ menu: st.menu === 'dossier' ? null : 'dossier' }),
      toggleClientMenu: () => this.setState({ menu: st.menu === 'client' ? null : 'client' }),
      togglePromptsMenu: () => this.setState({ menu: st.menu === 'prompts' ? null : 'prompts' }),
      toggleCustomMenu: () => this.setState({ menu: st.menu === 'custom' ? null : 'custom' }),
      toggleConcise: () => this.setState({ concise: !st.concise }),
      toggleNotes: () => this.setState({ notes: !st.notes }),
      conciseBg: st.concise ? '#2897FF' : 'var(--b5)', conciseKnob: st.concise ? '15px' : '2px',
      notesBg: st.notes ? '#2897FF' : 'var(--b5)', notesKnob: st.notes ? '15px' : '2px',
      toggleDeep: () => { this.setState({ deep: !st.deep }); this.showToast(!st.deep ? 'Recherche approfondie activée' : 'Recherche approfondie désactivée'); },
      deepFw: st.deep ? 700 : 500, deepColor: st.deep ? 'var(--accent)' : 'var(--t1)',
      improve: () => {
        const q = st.input.trim();
        if (!q) { this.showToast('Saisissez d\u2019abord une question'); return; }
        const ctx = st.dossierSel ? 'Dossier : ' + st.dossierSel + (st.clientSel ? ' · Client : ' + st.clientSel : '') + '\n' : '';
        this.setState({ input: ctx + 'Question : ' + q + '\nAttendu : réponse motivée, faits tirés des pièces cités comme tels, article applicable dans sa version en vigueur à la date des faits, décisions CCJA classées, signal d\u2019autorité.' });
        this.showToast('Question restructurée');
      },
      hasPanel: !!st.panel && (isChatView || isAnalysisView || st.view === 'recherche' || st.view === 'lecteur' || st.view === 'veilles'),
      panelIsDecision: !!st.panel && st.panel.type === 'decision',
      panelIsArticle: !!st.panel && st.panel.type === 'article',
      panelIsPiece: !!st.panel && st.panel.type === 'piece',
      pd: (() => { if (!st.panel || st.panel.type !== 'decision') return null;
        const d = D.decisions[st.panel.id];
        const line = this.authLineFor(st.panel.id);
        return { ...d, extract: d.extract.map((t, i) => ({ text: t, bg: i === d.hl ? 'var(--hl)' : 'transparent', pad: i === d.hl ? '8px 10px' : '0' })),
          articles: d.articles.map(id => ({ label: D.articles[id].label, open: openPanel({ type: 'article', id }) })),
          hasAnalyses: !!line,
          analyses: line ? [{ label: D.AN.auth.name, go: () => this.openAnalysis('auth', line) }] : [],
          hasSum: !!D.sums[st.panel.id],
          sum: D.sums[st.panel.id] || null,
          hasSimilar: !!(D.similars[st.panel.id] && D.similars[st.panel.id].length),
          similar: (D.similars[st.panel.id] || []).map(did => ({ label: D.shortRef[did] || D.decisions[did].title, sub: D.decisions[did].relevance, open: openPanel({ type: 'decision', id: did }) })) }; })(),
      pa: (() => { if (!st.panel || st.panel.type !== 'article') return null;
        const id = st.panel.id;
        const a = D.articles[id];
        const btns = [];
        if (D.artHist[id]) btns.push({ label: D.AN.hist.name, go: () => this.openAnalysis('hist', id) });
        if (D.artComp[id]) btns.push({ label: D.AN.comp.name, go: () => this.openAnalysis('comp', id) });
        btns.push({ label: D.AN.cite.name, go: () => this.openAnalysis('cite', id) });
        const watched = st.veilles.some(v => v.id === id && v.on);
        return { ...a, text: a.text.map((t, i) => ({ text: t, bg: i === a.hl ? 'var(--hl)' : 'transparent', pad: i === a.hl ? '8px 10px' : '0' })),
          topDecisions: a.top.map(did => ({ label: D.decisions[did].title, open: openPanel({ type: 'decision', id: did }) })),
          analyses: btns,
          watchLabel: watched ? 'Veille active ✓' : 'Créer une veille',
          watchBorder: watched ? 'var(--accent)' : 'var(--b3)',
          watch: () => this.toggleVeille(id, a.label) }; })(),
      pp: (() => { if (!st.panel || st.panel.type !== 'piece') return null;
        const p = D.pieces[st.panel.id];
        return { ...p, extract: p.extract.map((t, i) => ({ text: t, bg: i === p.hl ? 'var(--hl)' : 'transparent', pad: i === p.hl ? '8px 10px' : '0' })) }; })(),
      panelKind: !st.panel ? '' : (st.panel.type === 'decision' ? 'Décision · CCJA' : (st.panel.type === 'article' ? 'Article · Texte applicable' : 'Pièce · Document du dossier')),
      sendBg: canSend ? 'var(--accent)' : 'var(--btnoff)', sendFg: canSend ? 'var(--on-accent)' : 'var(--t5)',
      onInput: e => this.setState({ input: e.target.value }),
      onKey: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } },
      onSend: () => this.send(),
      onKeyDossier: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.askFromDossier(); } },
      askDossier: () => this.askFromDossier(),
      newChat: () => this.nav('assistant', { chat: false, messages: [], activeConv: null, panel: null, input: '', dossierSel: null, dossierSelId: null, clientSel: null }),
      closePanel: () => this.setState({ panel: null }),
      scrollRef: el => { this._sc = el; },
      searchOpen: st.searchOpen, searchQ: st.searchQ, searchResults, searchEmpty: searchResults.length === 0,
      openSearch: () => this.setState({ searchOpen: true, searchQ: '' }),
      closeSearch: () => this.setState({ searchOpen: false }),
      onSearchInput: e => this.setState({ searchQ: e.target.value }),
      stop: e => e.stopPropagation(),
      toast: st.toast, hasToast: !!st.toast,
    };
  }
}

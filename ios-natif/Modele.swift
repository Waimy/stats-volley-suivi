//
//  Modele.swift
//  Stats Volley — modèle de données (SwiftData, iOS 17+), format 6×6
//
//  Principe : on ne stocke PAS le score, la rotation ni les stats.
//  On stocke un journal d'événements par set, et tout est recalculé
//  en rejouant ce journal (voir MoteurMatch en bas de fichier).
//  → "Annuler" = supprimer le dernier événement.
//  → "Modifier un point" = remplacer cet événement ; tout ce qui suit est recalculé.
//
//  Enums stockées en String (raw value) : plus robuste pour SwiftData
//  (prédicats, migrations) et on peut renommer un libellé sans casser les données.
//  Valeurs par défaut partout : compatible avec une future synchro iCloud (CloudKit).
//

import Foundation
import SwiftData

// MARK: - Énumérations de base

enum Poste: String, Codable, CaseIterable, Identifiable {
    case passeur, pointu, receptionneurAttaquant, central, libero, polyvalent
    var id: String { rawValue }
    var libelle: String {
        switch self {
        case .passeur: "Passeur"
        case .pointu: "Pointu"
        case .receptionneurAttaquant: "Réceptionneur-attaquant"
        case .central: "Central"
        case .libero: "Libéro"
        case .polyvalent: "Polyvalent"
        }
    }
}

enum TypeMatch: String, Codable { case officiel, amical }
enum StatutMatch: String, Codable { case preparation, enCours, termine }
enum Camp: String, Codable { case nous, adversaire }
enum Resultat: String, Codable { case gagne, perdu }
enum TypeEvenement: String, Codable {
    case point, remplacement, tempsMort
    case liberoEntree, liberoSortie
    /// Le libéro en jeu est remplacé par l'autre libéro (même joueur remplacé).
    case liberoEchange
    /// Libéro blessé : ne rejoue plus du match ; remplacé par l'autre libéro ou par le joueur qu'il remplaçait.
    case liberoBlesse
    /// Plus aucun libéro disponible : un joueur hors du terrain devient libéro pour la fin du match.
    case liberoRedesigne
    /// Blessure d'un joueur (hors libéro) : non compté, le blessé ne rejoue plus du match.
    case remplacementExceptionnel
    /// Réparation d'une composition mal saisie : ne compte pas comme remplacement.
    case correction
}

// MARK: - Règles (struct stockée dans le Match)

/// Format 6×6 uniquement : formationDepart a toujours 6 positions.
struct ReglesMatch: Codable, Equatable {
    /// Officiel : 3 = au meilleur des 5 sets. nil si nombre de sets fixe.
    var setsGagnantsPourVictoire: Int? = 3
    /// Amical : on joue N sets quoi qu'il arrive. nil en officiel.
    var nombreSetsFixe: Int? = nil
    var pointsParSet: Int = 25
    var pointsDernierSet: Int = 15
    var ecartMinimum: Int = 2
    /// nil = illimité
    var remplacementsMaxParSet: Int? = 6
    var tempsMortsParSet: Int? = 2
    var liberoAutorise: Bool = true

    static let officiel = ReglesMatch()
    static let amical = ReglesMatch(
        setsGagnantsPourVictoire: nil,
        nombreSetsFixe: 4,
        remplacementsMaxParSet: nil,
        tempsMortsParSet: nil
    )

    /// Points à atteindre pour le set n° `numero`.
    func pointsCible(setNumero numero: Int) -> Int {
        if let n = setsGagnantsPourVictoire, numero == 2 * n - 1 { return pointsDernierSet }
        return pointsParSet
    }
}

// MARK: - Réglages de saisie (globaux à l'app → @AppStorage, pas SwiftData)

enum ModePrecisions: String, CaseIterable {
    /// Aucune précision demandée : saisie la plus rapide (défaut).
    case jamais
    /// Seulement pour les fautes de service et d'attaque.
    case serviceEtAttaque
    case toujours
}

/// À brancher sur @AppStorage dans les vues :
/// @AppStorage("precisions") var precisions = ModePrecisions.jamais
/// @AppStorage("noteReception") var noteReception = true
enum CleReglage {
    static let precisions = "precisions"
    static let noteReception = "noteReception"
}

// MARK: - Modèles persistés

@Model final class Equipe {
    var nom: String = ""
    var club: String = ""
    @Relationship(deleteRule: .cascade, inverse: \Joueur.equipe) var joueurs: [Joueur]? = []
    @Relationship(deleteRule: .cascade, inverse: \Match.equipe) var matchs: [Match]? = []

    init(nom: String, club: String = "") {
        self.nom = nom
        self.club = club
    }
}

@Model final class Joueur {
    var id: UUID = UUID()
    var prenom: String = ""
    var nom: String = ""
    var numeroHabituel: Int? = nil
    var posteHabituelRaw: String = Poste.polyvalent.rawValue
    var postesPossiblesRaw: [String] = []
    /// On archive (actif = false) plutôt que supprimer : l'historique des stats reste intact.
    var actif: Bool = true
    var equipe: Equipe?
    @Relationship(deleteRule: .nullify, inverse: \Convocation.joueur) var convocations: [Convocation]? = []

    var posteHabituel: Poste {
        get { Poste(rawValue: posteHabituelRaw) ?? .polyvalent }
        set { posteHabituelRaw = newValue.rawValue }
    }

    init(prenom: String, nom: String, numero: Int? = nil, poste: Poste = .polyvalent) {
        self.prenom = prenom
        self.nom = nom
        self.numeroHabituel = numero
        self.posteHabituelRaw = poste.rawValue
    }
}

@Model final class Match {
    var date: Date = Date()
    var adversaire: String = ""
    var lieu: String = ""
    var aDomicile: Bool = true
    var typeRaw: String = TypeMatch.officiel.rawValue
    var statutRaw: String = StatutMatch.preparation.rawValue
    var regles: ReglesMatch = ReglesMatch.officiel
    /// Amical : fin de match décidée à la main.
    var finForcee: Bool = false
    var equipe: Equipe?
    @Relationship(deleteRule: .cascade, inverse: \Convocation.match) var convocations: [Convocation]? = []
    @Relationship(deleteRule: .cascade, inverse: \SetMatch.match) var sets: [SetMatch]? = []

    var type: TypeMatch {
        get { TypeMatch(rawValue: typeRaw) ?? .officiel }
        set { typeRaw = newValue.rawValue }
    }

    init(adversaire: String, type: TypeMatch, date: Date = Date()) {
        self.adversaire = adversaire
        self.date = date
        self.typeRaw = type.rawValue
        self.regles = (type == .officiel) ? .officiel : .amical
    }
}

/// Pivot central : un joueur DANS un match donné.
/// Le poste et le numéro peuvent changer d'un match à l'autre.
/// Les événements pointent vers la Convocation (pas vers le Joueur)
/// pour pouvoir analyser "par poste joué ce jour-là".
@Model final class Convocation {
    var id: UUID = UUID()
    var numeroMaillot: Int = 0
    var posteMatchRaw: String = Poste.polyvalent.rawValue
    var estLibero: Bool = false
    var estCapitaine: Bool = false
    var joueur: Joueur?
    var match: Match?

    var posteMatch: Poste {
        get { Poste(rawValue: posteMatchRaw) ?? .polyvalent }
        set { posteMatchRaw = newValue.rawValue }
    }

    init(joueur: Joueur, numero: Int? = nil, poste: Poste? = nil) {
        self.joueur = joueur
        self.numeroMaillot = numero ?? joueur.numeroHabituel ?? 0
        let p = poste ?? joueur.posteHabituel
        self.posteMatchRaw = p.rawValue
        self.estLibero = (p == .libero)
    }
}

/// "Set" est déjà un type Swift → SetMatch.
@Model final class SetMatch {
    var numero: Int = 1
    var serviceInitialRaw: String = Camp.nous.rawValue
    /// IDs de Convocation. Index 0 = position 1 (serveur), index 5 = position 6.
    var formationDepart: [UUID] = []
    var liberoID: UUID? = nil
    var match: Match?
    /// SwiftData ne garantit pas l'ordre des relations → tri sur `ordre`.
    @Relationship(deleteRule: .cascade, inverse: \Evenement.setMatch) var evenements: [Evenement]? = []

    var serviceInitial: Camp {
        get { Camp(rawValue: serviceInitialRaw) ?? .nous }
        set { serviceInitialRaw = newValue.rawValue }
    }

    var evenementsOrdonnes: [Evenement] {
        (evenements ?? []).sorted { $0.ordre < $1.ordre }
    }

    init(numero: Int, serviceInitial: Camp, formation: [UUID], liberoID: UUID? = nil) {
        self.numero = numero
        self.serviceInitialRaw = serviceInitial.rawValue
        self.formationDepart = formation
        self.liberoID = liberoID
    }
}

/// Journal du set. Champs à plat (optionnels selon le type) :
/// plus simple et plus fiable avec SwiftData qu'un enum à valeurs associées.
@Model final class Evenement {
    var id: UUID = UUID()
    var ordre: Int = 0
    var horodatage: Date = Date()
    var typeRaw: String = TypeEvenement.point.rawValue

    // — Point —
    var resultatRaw: String? = nil        // gagne / perdu
    var causeRaw: String? = nil           // CausePoint
    /// Qui a fait l'action qui termine le point. nil pour "Je n'ai pas vu".
    var campDecisifRaw: String? = nil
    var detailRaw: String? = nil          // DetailFaute (facultatif)
    /// Joueur de MON équipe concerné (auteur, fautif, réceptionneur ou défenseur). nil = collectif / non attribué.
    var joueurID: UUID? = nil
    /// Note de réception 3-2-1 sur service adverse (facultative), 0 = ace subi (automatique).
    var noteReception: Int? = nil
    /// Nombre de taps de la saisie : sert à mesurer l'ergonomie.
    var taps: Int? = nil

    // — Remplacement —
    var sortantID: UUID? = nil
    var entrantID: UUID? = nil

    // — Libéro —
    /// Joueur remplacé par le libéro à son entrée.
    var remplaceID: UUID? = nil
    /// Libéro concerné : celui qui entre, celui qui arrive (échange), le blessé, ou le re-désigné.
    var liberoID: UUID? = nil
    /// Libéro blessé en jeu : l'autre libéro qui le remplace (nil = le joueur remplacé revient).
    var parLiberoID: UUID? = nil

    // — Correction de position : zone (0…5) et joueur réellement en place —
    var zone: Int? = nil
    var joueurCorrectionID: UUID? = nil

    // — Temps mort —
    var campRaw: String? = nil

    var setMatch: SetMatch?

    var type: TypeEvenement { TypeEvenement(rawValue: typeRaw) ?? .point }
    var resultat: Resultat? { resultatRaw.flatMap { Resultat(rawValue: $0) } }
    var cause: CausePoint? { causeRaw.flatMap { CausePoint(rawValue: $0) } }
    var campDecisif: Camp? { campDecisifRaw.flatMap { Camp(rawValue: $0) } }

    init(ordre: Int, type: TypeEvenement) {
        self.ordre = ordre
        self.typeRaw = type.rawValue
    }
}

// MARK: - Catalogue des causes (statique, dans le code, pas en base)

enum CategorieCause: String, Codable, CaseIterable {
    case service, attaque, contre, receptionDefense, passeRelance, fauteTechnique, sanction, collectif, inconnue
}

/// Convention : cause + campDecisif = l'action qui a terminé le point.
/// joueurID = toujours un joueur de MON équipe (auteur, fautif ou "victime").
enum CausePoint: String, Codable, CaseIterable {
    case ace, serviceGagnant, fauteService
    case attaqueGagnante, blocOut, attaqueFaute
    case contreGagnant
    /// Réception de service ratée : couvre TOUS les aces adverses (choix de saisie).
    case receptionRatee
    /// Défense / free ball mal contrôlée (hors réception de service).
    case receptionDefenseFaute
    case deuxiemeMainGagnante, relanceGagnante, fautePasse, relanceRatee
    case fauteTechnique
    case sanction
    case mesentente
    /// "Je n'ai pas vu" : garde score et rotation justes quand l'échange est raté.
    case inconnue

    var categorie: CategorieCause {
        switch self {
        case .ace, .serviceGagnant, .fauteService: .service
        case .attaqueGagnante, .blocOut, .attaqueFaute: .attaque
        case .contreGagnant: .contre
        case .receptionRatee, .receptionDefenseFaute: .receptionDefense
        case .deuxiemeMainGagnante, .relanceGagnante, .fautePasse, .relanceRatee: .passeRelance
        case .fauteTechnique: .fauteTechnique
        case .sanction: .sanction
        case .mesentente: .collectif
        case .inconnue: .inconnue
        }
    }
}

enum DetailFaute: String, Codable, CaseIterable {
    // Service
    case serviceFilet, serviceDehors, servicePied, delai8s
    // Réception de service
    case aceNonTouche, receptionInjouable
    // Attaque
    case attaqueDehors, attaqueFilet, antenne
    // Passe
    case doubleTouche, ballonTenu
    // Technique
    case quatreTouches, toucheFilet, ligneCentrale, invasion, faute3m, fauteLibero,
         contreArriere, contreOuAttaqueSurService, plafondObstacle, position
    // Sanction
    case cartonRouge, retardJeu
}

/// Comment l'UI choisit le joueur après la cause.
/// joueurOuCollectif : on désigne un joueur, avec un bouton "collectif"
/// pour le ballon tombé entre deux réceptionneurs.
enum AttributionJoueur { case aucune, serveurAuto, obligatoire, joueurOuCollectif, facultative }

struct OptionCause: Identifiable {
    let cause: CausePoint
    /// nil uniquement pour "Je n'ai pas vu".
    let camp: Camp?
    let attribution: AttributionJoueur
    let details: [DetailFaute]
    var id: String { "\(cause.rawValue)-\(camp?.rawValue ?? "inconnu")" }

    /// Faut-il afficher l'étape "précision" avec ce réglage ?
    func demandePrecision(_ mode: ModePrecisions) -> Bool {
        guard !details.isEmpty else { return false }
        switch mode {
        case .jamais: return false
        case .toujours: return true
        case .serviceEtAttaque: return cause == .fauteService || cause == .attaqueFaute
        }
    }

    /// Option grisée si elle contredit qui sert (ex. ace de notre côté quand l'adversaire sert).
    func indisponible(service: Camp) -> String? {
        let estService = [.ace, .serviceGagnant, .fauteService].contains(cause)
        if estService, camp == .nous, service != .nous { return "on ne sert pas" }
        if estService, camp == .adversaire, service != .adversaire { return "l'adversaire ne sert pas" }
        if cause == .receptionRatee, service != .adversaire { return "on est au service" }
        return nil
    }
}

enum CatalogueCauses {
    static let inconnue = OptionCause(cause: .inconnue, camp: nil, attribution: .aucune, details: [])

    static let gagne: [OptionCause] = [
        // Action de mon équipe
        .init(cause: .ace, camp: .nous, attribution: .serveurAuto, details: []),
        .init(cause: .serviceGagnant, camp: .nous, attribution: .serveurAuto, details: []),
        .init(cause: .attaqueGagnante, camp: .nous, attribution: .obligatoire, details: []),
        .init(cause: .blocOut, camp: .nous, attribution: .obligatoire, details: []),
        .init(cause: .contreGagnant, camp: .nous, attribution: .obligatoire, details: []),
        .init(cause: .deuxiemeMainGagnante, camp: .nous, attribution: .obligatoire, details: []),
        .init(cause: .relanceGagnante, camp: .nous, attribution: .obligatoire, details: []),
        // Faute adverse
        .init(cause: .fauteService, camp: .adversaire, attribution: .aucune,
              details: [.serviceFilet, .serviceDehors, .servicePied, .delai8s]),
        .init(cause: .attaqueFaute, camp: .adversaire, attribution: .aucune,
              details: [.attaqueDehors, .attaqueFilet, .antenne]),
        .init(cause: .receptionDefenseFaute, camp: .adversaire, attribution: .aucune, details: []),
        .init(cause: .fautePasse, camp: .adversaire, attribution: .aucune, details: [.doubleTouche, .ballonTenu]),
        .init(cause: .relanceRatee, camp: .adversaire, attribution: .aucune, details: []),
        .init(cause: .fauteTechnique, camp: .adversaire, attribution: .aucune, details: DetailFaute.techniques),
        .init(cause: .sanction, camp: .adversaire, attribution: .aucune, details: [.cartonRouge, .retardJeu]),
        inconnue,
    ]

    static let perdu: [OptionCause] = [
        // Faute de mon équipe
        .init(cause: .fauteService, camp: .nous, attribution: .serveurAuto,
              details: [.serviceFilet, .serviceDehors, .servicePied, .delai8s]),
        .init(cause: .receptionRatee, camp: .nous, attribution: .joueurOuCollectif,
              details: [.aceNonTouche, .receptionInjouable]),
        .init(cause: .attaqueFaute, camp: .nous, attribution: .obligatoire,
              details: [.attaqueDehors, .attaqueFilet, .antenne]),
        .init(cause: .receptionDefenseFaute, camp: .nous, attribution: .obligatoire, details: []),
        .init(cause: .fautePasse, camp: .nous, attribution: .obligatoire, details: [.doubleTouche, .ballonTenu]),
        .init(cause: .relanceRatee, camp: .nous, attribution: .obligatoire, details: []),
        .init(cause: .fauteTechnique, camp: .nous, attribution: .facultative, details: DetailFaute.techniques),
        .init(cause: .sanction, camp: .nous, attribution: .facultative, details: [.cartonRouge, .retardJeu]),
        .init(cause: .mesentente, camp: .nous, attribution: .aucune, details: []),
        // Action adverse réussie (joueur = celui de mon équipe qui la subit)
        // Pas d'ace adverse ici : il est saisi comme receptionRatee (faute de notre côté).
        .init(cause: .attaqueGagnante, camp: .adversaire, attribution: .facultative, details: []),// défenseur
        .init(cause: .blocOut, camp: .adversaire, attribution: .facultative, details: []),        // contreur
        .init(cause: .contreGagnant, camp: .adversaire, attribution: .obligatoire, details: []),  // mon attaquant contré
        .init(cause: .deuxiemeMainGagnante, camp: .adversaire, attribution: .aucune, details: []),
        .init(cause: .relanceGagnante, camp: .adversaire, attribution: .aucune, details: []),
        inconnue,
    ]

    /// Raccourcis du premier écran, adaptés à qui sert. "Je n'ai pas vu" toujours en dernier.
    static func raccourcis(resultat: Resultat, service: Camp) -> [OptionCause] {
        let liste = resultat == .gagne ? gagne : perdu
        func o(_ c: CausePoint, _ camp: Camp) -> OptionCause? { liste.first { $0.cause == c && $0.camp == camp } }
        let choix: [OptionCause?]
        switch (resultat, service) {
        case (.gagne, .nous):       choix = [o(.ace, .nous), o(.attaqueGagnante, .nous), o(.contreGagnant, .nous), o(.attaqueFaute, .adversaire)]
        case (.gagne, .adversaire): choix = [o(.attaqueGagnante, .nous), o(.fauteService, .adversaire), o(.contreGagnant, .nous), o(.attaqueFaute, .adversaire)]
        case (.perdu, .nous):       choix = [o(.fauteService, .nous), o(.attaqueGagnante, .adversaire), o(.contreGagnant, .adversaire), o(.attaqueFaute, .nous)]
        case (.perdu, .adversaire): choix = [o(.receptionRatee, .nous), o(.attaqueGagnante, .adversaire), o(.contreGagnant, .adversaire), o(.attaqueFaute, .nous)]
        }
        return choix.compactMap { $0 } + [inconnue]
    }
}

extension DetailFaute {
    static let techniques: [DetailFaute] = [
        .quatreTouches, .toucheFilet, .ligneCentrale, .invasion, .faute3m, .fauteLibero,
        .contreArriere, .contreOuAttaqueSurService, .plafondObstacle, .position,
    ]
}

// MARK: - Moteur : rejoue le journal pour obtenir l'état du set

struct EtatSet {
    var scoreNous = 0
    var scoreAdversaire = 0
    var auService: Camp
    /// Index 0 = position 1. Contient les IDs de Convocation.
    var positions: [UUID?]
    var remplacementsNous = 0
    var tempsMortsNous = 0
    var tempsMortsAdversaire = 0

    // Libéro
    var liberoID: UUID?
    var liberoEnJeu = false
    var remplaceParLibero: UUID? = nil

    // Règle officielle des remplacements : titulaire → (remplaçant, revenu ?)
    var paires: [UUID: (remplacant: UUID, revenu: Bool)] = [:]
    /// Vrai après un changement de libéro (y compris la sortie auto en zone 4) jusqu'au prochain échange joué.
    var verrouLibero = false
    var ontJoue: Set<UUID> = []
    /// Titulaires effectifs du set : la formation de départ, rectifiée par les corrections de position.
    var titulaires: Set<UUID> = []

    // Hérité des sets précédents puis complété dans ce set.
    /// Blessés (remplacement exceptionnel ou libéro blessé) : exclus pour le reste du match.
    var blesses: Set<UUID> = []
    /// Libéros du match : convoqués comme libéro + re-désignés.
    var liberosMatch: [UUID] = []
    /// Joueurs entrés sur remplacement exceptionnel : seule la limite de nombre s'applique ensuite.
    var exceptionnels: Set<UUID> = []

    var liberosDisponibles: [UUID] { liberosMatch.filter { !blesses.contains($0) } }

    /// Le serveur est connu automatiquement → zéro tap pour ace / faute de service.
    var serveurActuel: UUID? { auService == .nous ? (positions.first ?? nil) : nil }
}

enum MoteurMatch {

    /// État du set après tous les événements, ou juste avant l'événement n° `jusquA`
    /// (utile pour modifier un point passé : on rejoue jusqu'à lui pour connaître serveur et positions).
    static func etat(du set: SetMatch, jusquA limite: Int? = nil) -> EtatSet {
        var e = EtatSet(auService: set.serviceInitial,
                        positions: set.formationDepart.map { Optional($0) },
                        liberoID: set.liberoID)
        e.ontJoue = Set(set.formationDepart)
        e.titulaires = Set(set.formationDepart)
        if let match = set.match {
            let h = heritage(match: match, avant: set)
            e.blesses = h.blesses
            e.liberosMatch = liberosConvoques(match) + h.redesignes
        }
        for (i, ev) in set.evenementsOrdonnes.enumerated() {
            if let limite, i >= limite { break }
            appliquer(ev, a: &e, formation: set.formationDepart)
        }
        return e
    }

    static func liberosConvoques(_ match: Match) -> [UUID] {
        (match.convocations ?? []).filter(\.estLibero).map(\.id)
    }

    /// Ce qui passe d'un set à l'autre : blessés et libéros re-désignés.
    /// `avant: nil` = tous les sets (pour composer le set suivant).
    static func heritage(match: Match, avant set: SetMatch?) -> (blesses: Set<UUID>, redesignes: [UUID]) {
        var blesses: Set<UUID> = [], redes: [UUID] = []
        let precedents = (match.sets ?? []).filter { set == nil || $0.numero < set!.numero }.sorted { $0.numero < $1.numero }
        for s in precedents {
            for ev in s.evenementsOrdonnes {
                switch ev.type {
                case .remplacementExceptionnel: if let b = ev.sortantID { blesses.insert(b) }
                case .liberoBlesse: if let b = ev.liberoID { blesses.insert(b) }
                case .liberoRedesigne: if let l = ev.liberoID { redes.append(l) }
                default: break
                }
            }
        }
        return (blesses, redes)
    }

    /// Joueurs pouvant entrer : hors du terrain, pas libéro, pas remplacé par le libéro, pas blessé.
    static func joueursDisponibles(match: Match, etat e: EtatSet) -> [Convocation] {
        (match.convocations ?? []).filter { c in
            !e.liberosMatch.contains(c.id) && !e.positions.contains(c.id)
                && c.id != e.remplaceParLibero && !e.blesses.contains(c.id)
        }
    }

    static func appliquer(_ ev: Evenement, a e: inout EtatSet, formation: [UUID]) {
        switch ev.type {
        case .point:
            guard let r = ev.resultat else { return }
            e.verrouLibero = false
            if r == .gagne {
                e.scoreNous += 1
                // Reprise de service → on tourne.
                if e.auService == .adversaire {
                    e.auService = .nous
                    tourner(&e)
                }
            } else {
                e.scoreAdversaire += 1
                e.auService = .adversaire
            }

        case .remplacement:
            guard let s = ev.sortantID, let n = ev.entrantID, let i = e.positions.firstIndex(of: s) else { return }
            e.positions[i] = n
            e.remplacementsNous += 1
            e.ontJoue.insert(n)
            if e.titulaires.contains(s), e.paires[s] == nil {
                e.paires[s] = (n, false)
            } else if let titulaire = e.paires.first(where: { $0.value.remplacant == s })?.key, titulaire == n {
                e.paires[titulaire]?.revenu = true
            }

        case .tempsMort:
            if ev.campRaw == Camp.nous.rawValue { e.tempsMortsNous += 1 } else { e.tempsMortsAdversaire += 1 }

        case .remplacementExceptionnel:
            guard let s = ev.sortantID, let n = ev.entrantID, let i = e.positions.firstIndex(of: s) else { return }
            e.positions[i] = n                      // non compté dans remplacementsNous
            e.blesses.insert(s)
            e.ontJoue.insert(n)
            e.exceptionnels.insert(n)

        case .liberoEntree:
            guard let lib = ev.liberoID ?? e.liberoID, let r = ev.remplaceID, let i = e.positions.firstIndex(of: r) else { return }
            e.positions[i] = lib
            e.liberoID = lib
            e.liberoEnJeu = true
            e.remplaceParLibero = r
            e.verrouLibero = true

        case .liberoSortie:
            sortirLibero(&e)

        case .liberoEchange:
            guard let nouveau = ev.liberoID, let ancien = e.liberoID, let i = e.positions.firstIndex(of: ancien) else { return }
            e.positions[i] = nouveau
            e.liberoID = nouveau
            e.verrouLibero = true

        case .liberoBlesse:
            guard let b = ev.liberoID else { return }
            e.blesses.insert(b)
            if e.liberoEnJeu, e.liberoID == b, let i = e.positions.firstIndex(of: b) {
                if let autre = ev.parLiberoID {
                    e.positions[i] = autre
                    e.liberoID = autre
                } else {
                    e.positions[i] = e.remplaceParLibero
                    e.liberoEnJeu = false
                    e.remplaceParLibero = nil
                }
            } else if e.liberoID == b {
                e.liberoID = e.liberosDisponibles.first
            }

        case .liberoRedesigne:
            guard let l = ev.liberoID else { return }
            e.liberosMatch.append(l)
            if !e.liberoEnJeu { e.liberoID = l }

        case .correction:
            guard let z = ev.zone, let j = ev.joueurCorrectionID, z >= 0, z < e.positions.count else { return }
            let avant = e.positions[z]
            if let autre = e.positions.firstIndex(of: j) {
                e.positions[autre] = avant          // échange de deux joueurs en place
            } else {
                e.ontJoue.insert(j)                 // joueur du banc, non compté comme remplacement
                if let a = avant { e.ontJoue.remove(a) }  // le joueur mal saisi n'a pas réellement joué
                // Le joueur mal saisi est remplacé dans son rôle (titulaire ou remplaçant).
                if let a = avant, e.titulaires.contains(a) {
                    e.titulaires.remove(a)
                    e.titulaires.insert(j)
                    if let paire = e.paires.removeValue(forKey: a) { e.paires[j] = paire }
                } else if let a = avant, let t = e.paires.first(where: { $0.value.remplacant == a })?.key {
                    e.paires[t]?.remplacant = j
                }
            }
            e.positions[z] = j
        }
    }

    /// Rotation horaire : pos2 → pos1, pos3 → pos2, … , pos1 → pos6.
    /// Le libéro sort automatiquement s'il arrive en zone 4 (rangée avant).
    static func tourner(_ e: inout EtatSet) {
        guard !e.positions.isEmpty else { return }
        e.positions.append(e.positions.removeFirst())
        if e.liberoEnJeu, let lib = e.liberoID, e.positions[3] == lib {
            sortirLibero(&e)
        }
    }

    static func sortirLibero(_ e: inout EtatSet) {
        guard let lib = e.liberoID, let i = e.positions.firstIndex(of: lib) else { return }
        e.positions[i] = e.remplaceParLibero
        e.liberoEnJeu = false
        e.remplaceParLibero = nil
        e.verrouLibero = true
    }

    static func setTermine(_ e: EtatSet, setNumero: Int, regles: ReglesMatch) -> Bool {
        let cible = regles.pointsCible(setNumero: setNumero)
        return max(e.scoreNous, e.scoreAdversaire) >= cible
            && abs(e.scoreNous - e.scoreAdversaire) >= regles.ecartMinimum
    }

    /// nil = autorisé, sinon le message à afficher.
    static func refusRemplacement(_ e: EtatSet, sortant: UUID, entrant: UUID,
                                  formation: [UUID], match: Match) -> String? {
        if e.blesses.contains(entrant) { return "Joueur blessé : il ne peut plus rejouer de ce match." }
        if let max = match.regles.remplacementsMaxParSet, e.remplacementsNous >= max {
            return "Plus de remplacement possible (\(max) max par set)."
        }
        guard match.type == .officiel else { return nil }
        if e.exceptionnels.contains(sortant) { return nil }
        if e.titulaires.contains(sortant) {
            if e.paires[sortant] != nil { return "Ce titulaire est déjà sorti et revenu dans ce set." }
            if e.titulaires.contains(entrant) { return "Un titulaire ne revient qu'à la place de son remplaçant." }
            if e.ontJoue.contains(entrant) { return "Ce joueur a déjà joué ce set." }
            return nil
        }
        guard let titulaire = e.paires.first(where: { $0.value.remplacant == sortant })?.key else {
            return "Remplacement impossible."
        }
        if e.paires[titulaire]?.revenu == true { return "Ce remplacement a déjà été fait." }
        return titulaire == entrant ? nil : "Ce joueur ne peut sortir qu'au profit de son titulaire."
    }

    /// Remplacement exceptionnel : en officiel, seulement si aucun remplacement régulier
    /// n'est possible pour le blessé. nil = autorisé.
    static func refusExceptionnel(_ e: EtatSet, blesse: UUID, entrant: UUID,
                                  formation: [UUID], match: Match) -> String? {
        if e.liberoEnJeu, blesse == e.liberoID { return "Pour un libéro blessé, utiliser « libéro blessé »." }
        guard match.type == .officiel else { return nil }
        let reguliers = joueursDisponibles(match: match, etat: e).filter {
            refusRemplacement(e, sortant: blesse, entrant: $0.id, formation: formation, match: match) == nil
        }
        return reguliers.isEmpty ? nil : "Un remplacement régulier est encore possible : il doit être utilisé en priorité."
    }

    /// Re-désignation possible seulement quand plus aucun libéro n'est disponible.
    static func redesignationPossible(_ e: EtatSet) -> Bool {
        !e.liberosMatch.isEmpty && e.liberosDisponibles.isEmpty
    }

    /// Le libéro remplace un arrière (zones 5, 6, 1) et n'entre pas en zone 1 quand on sert.
    /// Aucun changement possible tant qu'un échange n'a pas été joué depuis le précédent.
    static func zonesEntreeLibero(_ e: EtatSet) -> [Int] {
        guard !e.verrouLibero else { return [] }
        return [4, 5, 0].filter { !($0 == 0 && e.auService == .nous) }
    }

    /// Zones (index 0 = zone 1) de la rangée avant.
    static let zonesAvant: Set<Int> = [1, 2, 3]

    /// Le joueur en `zone` peut-il être désigné pour cette action ? nil = oui, sinon la raison.
    static func ineligibilite(option: OptionCause, detail: DetailFaute?, zone: Int, etat e: EtatSet) -> String? {
        let avant = zonesAvant.contains(zone)
        let estLibero = e.liberoEnJeu && e.positions[zone] == e.liberoID
        switch (option.cause, option.camp) {
        case (.contreGagnant, .nous), (.blocOut, .adversaire):
            return avant ? nil : "arrière : ne contre pas"
        case (.deuxiemeMainGagnante, _):
            if estLibero { return "libéro" }
            return avant ? nil : "arrière : interdit devant les 3 m"
        case (.attaqueGagnante, .nous), (.blocOut, .nous), (.attaqueFaute, .nous), (.contreGagnant, .adversaire):
            return estLibero ? "le libéro n'attaque pas" : nil
        case (.fauteTechnique, _):
            switch detail {
            case .fauteLibero: return estLibero ? nil : "ce n'est pas le libéro"
            case .faute3m, .contreArriere:
                if estLibero { return "libéro : faute du libéro" }
                return avant ? "joueur avant" : nil
            case .position: return "faute collective"
            default: return nil
            }
        default:
            return nil
        }
    }

    /// Précision impossible dans la situation (ex. faute du libéro sans libéro en jeu).
    static func precisionIndisponible(_ d: DetailFaute, etat e: EtatSet) -> String? {
        d == .fauteLibero && !e.liberoEnJeu ? "libéro pas en jeu" : nil
    }

    /// Note de réception à enregistrer : 0 automatique sur réception ratée,
    /// la note choisie sur service adverse, rien quand on sert.
    static func noteReception(cause: CausePoint, service: Camp, noteChoisie: Int?) -> Int? {
        if cause == .receptionRatee { return 0 }
        return service == .adversaire ? noteChoisie : nil
    }

    /// Annuler = supprimer le dernier événement. Le reste se recalcule.
    static func annulerDernier(dans set: SetMatch, contexte: ModelContext) {
        guard let dernier = set.evenementsOrdonnes.last else { return }
        contexte.delete(dernier)
    }

    /// Modifier un point passé : le résultat (gagné/perdu) est conservé pour ne pas décaler
    /// le score ; on remplace cause, camp, précision et joueur. Tout ce qui suit est recalculé.
    static func modifierPoint(_ ev: Evenement, option: OptionCause, detail: DetailFaute?,
                              joueur: UUID?, etatAvant: EtatSet) {
        ev.causeRaw = option.cause.rawValue
        ev.campDecisifRaw = option.camp?.rawValue
        ev.detailRaw = detail?.rawValue
        ev.joueurID = option.attribution == .serveurAuto ? etatAvant.serveurActuel : joueur
        if option.cause == .receptionRatee { ev.noteReception = 0 }
    }

    static func prochainOrdre(dans set: SetMatch) -> Int {
        (set.evenementsOrdonnes.last?.ordre ?? -1) + 1
    }
}

// MARK: - Non géré à ce stade
// - Expulsion / disqualification (sanctions qui imposent un remplacement).
// - Carton jaune (avertissement sans point).
// - Rotations numérotées par la position du passeur (R1–R6) et stats sur la saison : tour 2.

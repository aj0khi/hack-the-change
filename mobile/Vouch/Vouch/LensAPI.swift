// LensAPI.swift — the Employer lens logic, shared by LensView and the tests.
// Mirrors app.js + lens/lens.mjs on the website:
//   1. POST /api/lens: the server checks every credential signature, asks the AI model for
//      requirements and matches, then drops any quote that is not word-for-word in a signed transcript.
//   2. The phone checks the returned quotes again against its own verified credentials.
//   3. If the AI lens is unavailable, the same offline keyword rules as the website are used.
// GET /api/jobs gives live Calgary postings (Adzuna) when the server has them.

import Foundation

// MARK: - What the views show

nonisolated struct ProjectSuggestion: Hashable, Sendable {
    let title: String
    let organization: String
    let time: String
    let why: String
    let skills: [String]
}

nonisolated struct LensMatch: Hashable, Sendable {
    let credentialID: Int
    let label: String           // the matched skill (offline lens); empty for AI matches
    let quote: String
    var evidenceType: String? = nil   // "action" or "praise" (AI lens)
    var why: String? = nil
    var witness: String? = nil
    var issuer: String? = nil
}

nonisolated struct LensRow: Identifiable, Hashable, Sendable {
    let id: Int
    let requirement: String
    let matches: [LensMatch]
    var kind: String? = nil                       // soft / technical / credential / other (AI lens)
    var suggestions: [ProjectSuggestion] = []     // shown in Student view for gaps
    var keywordBased = true
}

nonisolated struct LensRejection: Hashable, Sendable {
    let requirement: String
    let credentialID: String
    let quote: String
    let reason: String
}

nonisolated struct LensOutcome: Sendable {
    nonisolated enum Mode: Sendable { case ai, offline }
    let mode: Mode
    let rows: [LensRow]
    var rejected: [LensRejection] = []
    var model = ""
    var validCredentials = 0
    var cached = false

    var matchedCount: Int { rows.filter { !$0.matches.isEmpty }.count }
}

// MARK: - Offline keyword lens (port of keywordLens / keywordSuggestions in app.js)

nonisolated enum EmployerLens {
    static let disclaimerAI = "AI extracts requirements and proposes matches; every quote is checked word-for-word against a signed credential before it's shown. Gaps are never filled by AI. Not a hiring recommendation."
    static let disclaimerOffline = "The AI lens is unavailable, so simple keyword rules matched requirements to signed credentials. Review every source and gap yourself. Not a hiring recommendation."

    /// Same split as the web: new lines and sentence ends, bullets removed, very short bits dropped, max 20.
    static func requirements(from posting: String) -> [String] {
        let pieces: [String]
        if let splitter = try? NSRegularExpression(pattern: #"\n+|(?<=[.!?])\s+"#) {
            var result: [String] = []
            var start = posting.startIndex
            for match in splitter.matches(in: posting, range: NSRange(posting.startIndex..., in: posting)) {
                guard let range = Range(match.range, in: posting) else { continue }
                result.append(String(posting[start..<range.lowerBound]))
                start = range.upperBound
            }
            result.append(String(posting[start...]))
            pieces = result
        } else {
            pieces = posting.components(separatedBy: .newlines)
        }
        return pieces
            .map { line in
                var text = line.trimmingCharacters(in: .whitespaces)
                while let first = text.first, "-•*".contains(first) { text.removeFirst() }
                return text.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .filter { $0.count > 3 }
            .prefix(20)
            .map { $0 }
    }

    /// First signed mapping whose skill keywords appear in the line; gaps get keyword project suggestions.
    static func keywordLens(posting: String, credentials: [VerifiedCredential]) -> [LensRow] {
        let mappings: [(id: Int, mapping: SkillMapping)] = credentials.flatMap { credential in
            credential.payload.mappings.map { (id: credential.id, mapping: $0) }
        }
        var rows: [LensRow] = []
        for (index, line) in requirements(from: posting).enumerated() {
            if let match = mappings.first(where: { DemoData.requirement(line, mentions: $0.mapping.skill) }) {
                let evidence = LensMatch(credentialID: match.id, label: match.mapping.skill, quote: match.mapping.quote)
                rows.append(LensRow(id: index, requirement: line, matches: [evidence]))
            } else {
                rows.append(LensRow(id: index, requirement: line, matches: [], suggestions: keywordSuggestions(for: line)))
            }
        }
        return rows
    }

    /// Catalog projects sharing the most skills the line mentions (at most two, ties keep catalog order).
    static func keywordSuggestions(for line: String) -> [ProjectSuggestion] {
        let wanted = DemoData.skills.filter { DemoData.requirement(line, mentions: $0) }
        guard !wanted.isEmpty else { return [] }
        var scored: [(index: Int, project: CommunityProject, shared: [String])] = []
        for (index, project) in DemoData.projects.enumerated() {
            let shared = project.skills.filter { wanted.contains($0) }
            if !shared.isEmpty { scored.append((index: index, project: project, shared: shared)) }
        }
        scored.sort { $0.shared.count != $1.shared.count ? $0.shared.count > $1.shared.count : $0.index < $1.index }
        return scored.prefix(2).map { item in
            ProjectSuggestion(title: item.project.title, organization: item.project.organization, time: item.project.time,
                              why: "Practises \(item.shared.joined(separator: " and ").lowercased()).",
                              skills: item.project.skills)
        }
    }

    static func offline(posting: String, credentials: [VerifiedCredential]) -> LensOutcome {
        LensOutcome(mode: .offline, rows: keywordLens(posting: posting, credentials: credentials),
                    validCredentials: credentials.count)
    }

    /// "Builds Digital: mentioned in 12 of 30 Calgary posting excerpts (Adzuna)" — the most-asked-for skill.
    static func demandLine(for skills: [String], demand: SkillDemand?) -> String? {
        guard let demand, demand.total > 0 else { return nil }
        var best: (skill: String, count: Int)?
        for skill in skills {
            let count = demand.counts[skill] ?? 0
            if best == nil || count > best!.count { best = (skill, count) }
        }
        guard let best, best.count > 0 else { return nil }
        return "Builds \(best.skill): mentioned in \(best.count) of \(demand.total) Calgary posting excerpts (Adzuna)"
    }
}

// MARK: - Server responses (shapes from lens/lens.mjs and lens/adzuna.mjs)

nonisolated struct LensResponse: Decodable, Sendable {
    nonisolated struct Requirement: Decodable, Sendable {
        let text: String
        let kind: String?
        let matches: [Match]?
        let suggestedProjects: [Suggestion]?
    }
    nonisolated struct Match: Decodable, Sendable {
        let credentialId: String
        let quote: String
        let evidenceType: String?
        let why: String?
        let witness: String?
        let issuer: String?
    }
    nonisolated struct Suggestion: Decodable, Sendable {
        let projectId: String
        let why: String?
    }
    nonisolated struct Rejected: Decodable, Sendable {
        let requirement: String?
        let credentialId: String?
        let quote: String?
        let reason: String?
    }
    nonisolated struct Stats: Decodable, Sendable {
        let validCredentials: Int?
    }

    let fallback: Bool?
    let error: String?
    let requirements: [Requirement]?
    let rejected: [Rejected]?
    let stats: Stats?
    let model: String?
    let cached: Bool?
}

nonisolated struct JobPosting: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String
    let company: String?
    let location: String?
    let description: String
    let snippet: Bool?
    let url: String?

    /// Same text the web puts in the posting box.
    var postingText: String { "\(title) — \(company ?? ""), \(location ?? "")\n\n\(description)" }
}

nonisolated struct SkillDemand: Decodable, Hashable, Sendable {
    let total: Int
    let counts: [String: Int]
}

nonisolated struct JobsResponse: Decodable, Sendable {
    let jobs: [JobPosting]?
    let demand: SkillDemand?
}

/// What the phone sends to /api/lens: only credentials signed by this phone's own issuer key,
/// because the server verifies them all against one public key. Server ids are positions in `tokens`.
nonisolated struct LensSubmission: Sendable {
    let tokens: [String]
    let credentialIDs: [Int]     // VerifiedCredential.id for each token
    let publicKeySPKI: String
}

nonisolated enum LensAPI {
    nonisolated enum Failure: Error { case unavailable }

    /// Turns a server answer into rows, checking every quote again on the phone (belt and braces).
    static func outcome(from response: LensResponse, submission: LensSubmission,
                        credentials: [VerifiedCredential]) throws -> LensOutcome {
        guard response.fallback != true, response.error == nil, let requirements = response.requirements else {
            throw Failure.unavailable
        }
        var rejected = (response.rejected ?? []).map {
            LensRejection(requirement: $0.requirement ?? "", credentialID: $0.credentialId ?? "",
                          quote: $0.quote ?? "", reason: $0.reason ?? "")
        }
        var rows: [LensRow] = []
        for (index, requirement) in requirements.enumerated() {
            var matches: [LensMatch] = []
            for match in requirement.matches ?? [] {
                var credential: VerifiedCredential?
                if let position = Int(match.credentialId), submission.credentialIDs.indices.contains(position) {
                    let id = submission.credentialIDs[position]
                    credential = credentials.first { $0.id == id }
                }
                guard let credential, !match.quote.isEmpty, credential.payload.transcript.contains(match.quote) else {
                    rejected.append(LensRejection(requirement: requirement.text, credentialID: match.credentialId,
                                                  quote: match.quote,
                                                  reason: "Quote is not word-for-word in a credential this phone verified."))
                    continue
                }
                matches.append(LensMatch(credentialID: credential.id, label: "", quote: match.quote,
                                         evidenceType: match.evidenceType, why: match.why,
                                         witness: match.witness ?? credential.payload.witness,
                                         issuer: match.issuer ?? credential.payload.issuer))
            }
            matches.sort { ($0.evidenceType == "action" ? 0 : 1) < ($1.evidenceType == "action" ? 0 : 1) }
            // Only real catalog projects, and only for soft/technical gaps (same rule as the server).
            let kind = requirement.kind ?? "other"
            var suggestions: [ProjectSuggestion] = []
            if matches.isEmpty, kind == "soft" || kind == "technical" {
                for suggestion in requirement.suggestedProjects ?? [] where suggestions.count < 2 {
                    guard let project = DemoData.project(id: suggestion.projectId),
                          !suggestions.contains(where: { $0.title == project.title }) else { continue }
                    suggestions.append(ProjectSuggestion(title: project.title, organization: project.organization,
                                                         time: project.time, why: suggestion.why ?? "",
                                                         skills: project.skills))
                }
            }
            rows.append(LensRow(id: index, requirement: requirement.text, matches: matches,
                                kind: kind, suggestions: suggestions, keywordBased: false))
        }
        return LensOutcome(mode: .ai, rows: rows, rejected: rejected, model: response.model ?? "unknown",
                           validCredentials: response.stats?.validCredentials ?? submission.tokens.count,
                           cached: response.cached ?? false)
    }

    static func analyze(posting: String, submission: LensSubmission,
                        credentials: [VerifiedCredential]) async throws -> LensOutcome {
        var request = URLRequest(url: ProoflyServer.baseURL.appending(path: "api/lens"), timeoutInterval: 40)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            LensRequestBody(posting: posting, credentials: submission.tokens, issuerPublicKey: submission.publicKeySPKI))
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(LensResponse.self, from: data)
        return try outcome(from: response, submission: submission, credentials: credentials)
    }

    static func jobs() async -> JobsResponse? {
        var request = URLRequest(url: ProoflyServer.baseURL.appending(path: "api/jobs"), timeoutInterval: 15)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let result = try? await URLSession.shared.data(for: request),
              (result.1 as? HTTPURLResponse)?.statusCode == 200
        else { return nil }
        return try? JSONDecoder().decode(JobsResponse.self, from: result.0)
    }
}

private nonisolated struct LensRequestBody: Encodable, Sendable {
    let posting: String
    let credentials: [String]
    let issuerPublicKey: String
}

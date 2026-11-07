// LensView.swift — mirrors the web "Employer lens".
// Offline: the same keyword rules as app.js. Optional: the team server's Gemini lens (POST /api/lens).
// Either way, a match only counts if its quote is word-for-word in a credential that verifies on this phone.

import Foundation
import SwiftUI
import UIKit

nonisolated struct LensMatch: Hashable, Sendable {
    let credentialID: Int
    let label: String      // skill (offline) or the model's short reason (AI)
    let quote: String
}

nonisolated struct LensRow: Identifiable, Hashable, Sendable {
    let id: Int
    let requirement: String
    let matches: [LensMatch]
}

nonisolated enum EmployerLens {
    static func requirements(from posting: String) -> [String] {
        posting
            .split(whereSeparator: \.isNewline)
            .map { line in
                var text = line.trimmingCharacters(in: .whitespaces)
                while let first = text.first, "-•*".contains(first) { text.removeFirst() }
                return text.trimmingCharacters(in: .whitespaces)
            }
            .filter { !$0.isEmpty }
            .prefix(20)
            .map { $0 }
    }

    /// Port of analyzeJob() in app.js: first signed mapping whose skill keywords appear in the line.
    static func keywordLens(posting: String, credentials: [VerifiedCredential]) -> [LensRow] {
        requirements(from: posting).enumerated().map { index, line in
            let match = credentials
                .flatMap { credential in credential.payload.mappings.map { (credential.id, $0) } }
                .first { DemoData.requirement(line, mentions: $0.1.skill) }
            return LensRow(id: index, requirement: line,
                           matches: match.map { [LensMatch(credentialID: $0.0, label: $0.1.skill, quote: $0.1.quote)] } ?? [])
        }
    }

    nonisolated private struct Request: Encodable {
        let posting: String
        let credentials: [String]
        let issuerPublicKey: String
    }
    nonisolated private struct Response: Decodable {
        let fallback: Bool?
        let requirements: [Requirement]?
        nonisolated struct Requirement: Decodable {
            let text: String
            let matches: [Match]
        }
        nonisolated struct Match: Decodable {
            let credentialId: String
            let quote: String
            let why: String?
        }
    }

    /// Returns nil when the server is unreachable or has no model, so the caller can fall back.
    static func aiLens(server: URL, posting: String, tokens: [String], issuerKey: String,
                       verified: [VerifiedCredential]) async -> [LensRow]? {
        var request = URLRequest(url: server.appending(path: "api/lens"), timeoutInterval: 25)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        guard let body = try? JSONEncoder().encode(Request(posting: posting, credentials: tokens, issuerPublicKey: issuerKey)),
              let result = try? await URLSession.shared.upload(for: request, from: body),
              (result.1 as? HTTPURLResponse)?.statusCode == 200,
              let decoded = try? JSONDecoder().decode(Response.self, from: result.0),
              decoded.fallback != true, let requirements = decoded.requirements
        else { return nil }

        // Re-check the server's answer on the phone: the credential must verify here,
        // and the quote must appear word for word in its transcript.
        let byID = Dictionary(uniqueKeysWithValues: verified.map { ($0.id, $0) })
        return requirements.enumerated().map { index, requirement in
            let matches = requirement.matches.compactMap { match -> LensMatch? in
                guard let id = Int(match.credentialId), let credential = byID[id],
                      !match.quote.isEmpty, credential.payload.transcript.contains(match.quote)
                else { return nil }
                return LensMatch(credentialID: id, label: match.why ?? "Matched evidence", quote: match.quote)
            }
            return LensRow(id: index, requirement: requirement.text, matches: matches)
        }
    }
}

struct LensView: View {
    @Environment(VouchStore.self) private var store
    @State private var posting = ""
    @State private var rows: [LensRow] = []
    @State private var engineNote = "Local keyword matching, not AI or a hiring recommendation. Review every source and gap yourself."
    @State private var isWorking = false
    @AppStorage("useAILens") private var useAI = false
    @AppStorage("lensServer") private var serverAddress = "http://localhost:8766"

    var body: some View {
        VPage {
            PageHeading(overline: "The employer lens", title: "See the proof behind the potential",
                        subtitle: "Connect job requirements to signed evidence, one line at a time.",
                        badge: ("Employer view", "briefcase"))

            // 01 / THE OPPORTUNITY
            VStack(alignment: .leading, spacing: 0) {
                CardLabel(left: "01 / The opportunity")
                Text("What are you looking for?")
                    .font(.display(22, relativeTo: .title2)).foregroundStyle(VColor.ink).padding(.top, 22)
                Text("Paste a job description or use the example to explore the lens.")
                    .font(.text(14)).foregroundStyle(VColor.bodyText).padding(.top, 7).padding(.bottom, 22)
                Text("JOB DESCRIPTION")
                    .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1).foregroundStyle(VColor.fieldLabel)
                    .padding(.bottom, 9)
                TextField("Paste requirements, one per line...", text: $posting, axis: .vertical)
                    .lineLimit(7...14)
                    .vField()
                    .accessibilityLabel("Job description")
                HStack(spacing: 8) {
                    Button {
                        Task { await analyze() }
                    } label: {
                        if isWorking { ProgressView().tint(.white) } else { Text("Find evidence") }
                    }
                    .buttonStyle(.vPrimary)
                    .disabled(posting.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                    Button("Use example") {
                        posting = DemoData.exampleJob
                        Task { await analyze() }
                    }
                    .buttonStyle(.vSubtle)
                }
                .padding(.top, 14)

                Toggle(isOn: $useAI) {
                    Text("Use the team's AI lens").font(.text(14, weight: .bold)).foregroundStyle(VColor.ink)
                }
                .tint(VColor.blue)
                .padding(.top, 18)
                if useAI {
                    TextField("Server address", text: $serverAddress)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .vField()
                        .padding(.top, 8)
                }
                Text(engineNote)
                    .font(.text(12)).foregroundStyle(VColor.hint).padding(.top, 12)
            }
            .vCard(border: VColor.line, padding: 19)
            .padding(.top, 28)

            // 02 / THE EVIDENCE
            VStack(alignment: .leading, spacing: 0) {
                CardLabel(left: "02 / The evidence", right: "Live view", rightColor: VColor.verifiedText)
                if rows.isEmpty {
                    VStack(spacing: 6) {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                            .font(.system(size: 22)).foregroundStyle(VColor.lensIcon)
                            .frame(width: 54, height: 54).background(Color(hex: 0xEDF0FD), in: .circle)
                            .padding(.bottom, 9)
                        Text("Let's connect the dots.").font(.display(18, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                        Text("Your evidence map will appear here.").font(.text(14)).foregroundStyle(Color(hex: 0x9AA79F))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
                } else {
                    VStack(spacing: 0) {
                        ForEach(rows) { LensRowView(row: $0) }
                    }
                    .padding(.top, 20)
                }
            }
            .vCard(border: VColor.line, padding: 19)
            .padding(.top, 14)
        }
    }

    private func analyze() async {
        isWorking = true
        defer { isWorking = false }
        let verified = store.verified
        if useAI, let url = URL(string: serverAddress), let key = store.issuerPublicKeySPKI,
           let aiRows = await EmployerLens.aiLens(server: url, posting: posting, tokens: store.tokens,
                                                  issuerKey: key, verified: verified) {
            rows = aiRows
            engineNote = "Checked by the team's AI lens, then every quote re-checked on this phone. Not a hiring recommendation."
        } else {
            rows = EmployerLens.keywordLens(posting: posting, credentials: verified)
            engineNote = useAI
                ? "The AI lens wasn't reachable, so local keyword matching was used. Not a hiring recommendation."
                : "Local keyword matching, not AI or a hiring recommendation. Review every source and gap yourself."
        }
        let matched = rows.filter { !$0.matches.isEmpty }.count
        UIAccessibility.post(notification: .announcement, argument: "Evidence map updated. \(matched) of \(rows.count) requirements have signed evidence.")
    }
}

private struct LensRowView: View {
    @Environment(VouchStore.self) private var store
    let row: LensRow

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(VColor.line).frame(height: 1)
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: row.matches.isEmpty ? "minus" : "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(row.matches.isEmpty ? VColor.gapIcon : VColor.resultIcon)
                    .frame(width: 25, height: 25)
                    .background(row.matches.isEmpty ? VColor.gapBackground : VColor.resultBackground, in: .circle)
                    .accessibilityLabel(row.matches.isEmpty ? "Gap" : "Matched")
                VStack(alignment: .leading, spacing: 5) {
                    Text(row.requirement).font(.display(15, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    if row.matches.isEmpty {
                        Text("No matching signed evidence found. This is not a judgment of ability.")
                            .font(.text(13)).foregroundStyle(VColor.resultText)
                    }
                    ForEach(row.matches, id: \.self) { match in
                        Text("\(match.label) · “\(match.quote)”").font(.text(13)).foregroundStyle(VColor.resultText)
                        if let credential = store.verified.first(where: { $0.id == match.credentialID }) {
                            NavigationLink(value: credential) {
                                Label("See the signed evidence", systemImage: "arrow.up.right")
                                    .labelStyle(TrailingIconLabel())
                                    .font(.text(13, weight: .bold, relativeTo: .footnote))
                                    .foregroundStyle(VColor.blue)
                                    .frame(minHeight: 44)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 17)
        }
    }
}

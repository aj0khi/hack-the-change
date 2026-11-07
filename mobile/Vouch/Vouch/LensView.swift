// LensView.swift — mirrors the web "Employer lens" (index.html #lens, app.js, lens/lens.css).
// 01 takes a full job posting (typed, a live Calgary posting, or the example).
// 02 shows the evidence map from the website's AI lens, or the offline keyword lens as a fallback,
//    with an Employer / Student switch; Student view suggests catalog projects for gaps.
// 03 looks up a public Badgr badge through the website's server.

import Foundation
import SwiftUI
import UIKit

nonisolated enum LensAudience: Sendable { case employer, student }

struct LensView: View {
    @Environment(VouchStore.self) private var store
    @Binding var selection: AppTab
    @Binding var vouchTask: String

    @State private var posting = ""
    @State private var outcome: LensOutcome?
    @State private var isLoading = false
    @State private var emptyMessage: (title: String, text: String)?
    @State private var audience: LensAudience = .employer
    @State private var jobs: [JobPosting] = []
    @State private var demand: SkillDemand?
    @State private var selectedJobID = ""

    private var selectedJob: JobPosting? { jobs.first { $0.id == selectedJobID } }

    var body: some View {
        VPage {
            PageHeading(overline: "The employer lens", title: "See the proof behind the potential",
                        subtitle: "Connect job requirements to signed evidence, one line at a time.",
                        badge: ("Employer view", "viewfinder"))

            opportunityCard
                .padding(.top, 28)

            evidenceCard
                .padding(.top, 14)

            // 03 / PUBLIC BADGE RECORD
            BadgeLookupCard().padding(.top, 20)
        }
        .task { await loadJobs() }
    }

    // MARK: 01 / The opportunity

    private var opportunityCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(left: "01 / The opportunity")
            Text("What are you looking for?")
                .font(.display(22, relativeTo: .title2)).foregroundStyle(VColor.ink).padding(.top, 22)
                .accessibilityAddTraits(.isHeader)
            Text("Paste your full job posting, pick a live Calgary posting, or use the example.")
                .font(.text(14)).foregroundStyle(LensColor.secondary).padding(.top, 7).padding(.bottom, 22)

            if !jobs.isEmpty { jobPicker.padding(.bottom, 16) }

            Text("JOB POSTING")
                .font(.text(12, weight: .bold, relativeTo: .caption)).tracking(1).foregroundStyle(LensColor.label)
                .padding(.bottom, 9)
                .accessibilityHidden(true)
            TextField("Paste the whole posting: paragraphs are fine.", text: $posting, axis: .vertical)
                .lineLimit(7...14)
                .vField()
                .accessibilityLabel("Job posting")

            HStack(spacing: 8) {
                Button { Task { await analyze() } } label: {
                    Label("Find evidence", systemImage: "arrow.right").labelStyle(TrailingIconLabel())
                }
                .buttonStyle(.vPrimary)
                .disabled(isLoading)
                Button("Use example") {
                    posting = DemoData.exampleJob
                    selectedJobID = ""
                    Task { await analyze() }
                }
                .buttonStyle(.vSubtle)
                .disabled(isLoading)
            }
            .padding(.top, 14)

            Label(outcome?.mode == .offline ? EmployerLens.disclaimerOffline : EmployerLens.disclaimerAI,
                  systemImage: "info.circle")
                .font(.text(12)).foregroundStyle(LensColor.secondary).padding(.top, 16)
        }
        .vCard(border: VColor.line, padding: 19)
    }

    /// "PICK A REAL CALGARY JOB" — only shown when the server has Adzuna postings, like the web.
    private var jobPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PICK A REAL CALGARY JOB")
                .font(.text(12, weight: .bold, relativeTo: .caption)).tracking(1).foregroundStyle(LensColor.label)
                .accessibilityHidden(true)
            Menu {
                Picker("Pick a real Calgary job", selection: $selectedJobID) {
                    Text("Choose a posting from Adzuna…").tag("")
                    ForEach(jobs) { job in
                        Text("\(job.title) — \(job.company ?? "Unknown employer")").tag(job.id)
                    }
                }
            } label: {
                HStack {
                    Text(selectedJob.map { "\($0.title) — \($0.company ?? "Unknown employer")" } ?? "Choose a posting from Adzuna…")
                        .foregroundStyle(selectedJob == nil ? VColor.hint : VColor.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").foregroundStyle(VColor.arrowIcon)
                }
                .vField()
            }
            .accessibilityLabel("Pick a real Calgary job, \(selectedJob?.title ?? "none chosen")")
            .onChange(of: selectedJobID) {
                guard let job = selectedJob else { return }
                posting = job.postingText
                Task { await analyze() }
            }
            if let job = selectedJob {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Live posting via Adzuna\(job.snippet == true ? " (Adzuna shares a short excerpt; paste the full text for a fuller check)" : "").")
                    if let link = job.url.flatMap({ URL(string: $0) }) {
                        Link("Open the full posting", destination: link)
                            .font(.text(12, weight: .bold, relativeTo: .caption))
                            .foregroundStyle(VColor.blueDark)
                            .frame(minHeight: 44)
                    }
                }
                .font(.text(12, relativeTo: .caption)).foregroundStyle(LensColor.secondary)
            }
        }
    }

    // MARK: 02 / The evidence

    private var evidenceCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("02 / THE EVIDENCE")
                    .font(.text(12, weight: .bold, relativeTo: .caption)).tracking(1.2)
                    .foregroundStyle(LensColor.secondary)
                Spacer()
                AudienceToggle(audience: $audience)
            }

            if isLoading {
                LensPlaceholder(symbol: nil, title: "Reading the posting…",
                                text: "Extracting requirements and checking every quote against signed credentials.")
            } else if let outcome {
                VStack(alignment: .leading, spacing: 0) {
                    LensSummary(outcome: outcome).padding(.top, 20).padding(.bottom, 4)
                    ForEach(outcome.rows) { row in
                        LensRowView(row: row, audience: audience, demand: demand) { title in
                            vouchTask = title
                            selection = .vouch
                        }
                    }
                    if outcome.mode == .ai { RejectedList(rejected: outcome.rejected) }
                }
            } else if let emptyMessage {
                LensPlaceholder(symbol: "doc.text.magnifyingglass", title: emptyMessage.title, text: emptyMessage.text)
            } else {
                LensPlaceholder(symbol: "doc.text.magnifyingglass", title: "Let's connect the dots.",
                                text: "Your evidence map will appear here.")
            }
        }
        .vCard(border: VColor.line, padding: 19)
        .onChange(of: audience) {
            UIAccessibility.post(notification: .announcement,
                                 argument: audience == .student ? "Showing student view with project suggestions." : "Showing employer view.")
        }
    }

    // MARK: Actions

    /// Port of analyzeJob() in app.js: try the AI lens, fall back to keyword rules.
    private func analyze() async {
        let input = posting.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else {
            outcome = nil
            emptyMessage = ("Add a job posting first.", "Paste the whole posting, or pick an example.")
            return
        }
        isLoading = true
        let credentials = store.verified
        var aiOutcome: LensOutcome?
        if let submission = store.lensSubmission() {
            aiOutcome = try? await LensAPI.analyze(posting: input, submission: submission, credentials: credentials)
        }
        let result = aiOutcome ?? EmployerLens.offline(posting: input, credentials: credentials)
        outcome = result
        isLoading = false
        let message = result.mode == .ai
            ? "\(result.matchedCount) of \(result.rows.count) requirements have verified evidence."
            : "Evidence map updated for \(result.rows.count) requirements."
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private func loadJobs() async {
        guard jobs.isEmpty, let response = await LensAPI.jobs() else { return }
        jobs = response.jobs ?? []
        demand = (response.demand?.total ?? 0) > 0 ? response.demand : nil
    }
}

/// Colours from lens/lens.css (its accessibility pass uses darker greys than styles.css).
private enum LensColor {
    static let secondary = Color(hex: 0x4F5C56)
    static let label = Color(hex: 0x3F4A45)
    static let body = Color(hex: 0x3F4A45)
    static let why = Color(hex: 0x5B6862)
    static let summaryGreen = (background: Color(hex: 0xEAF5EB), text: Color(hex: 0x2F5E45))
    static let summaryOffline = (background: Color(hex: 0xFDF3E3), text: Color(hex: 0x6B4A12))
    static let actionTag = Color(hex: 0x1F4A8A)
    static let praiseTag = Color(hex: 0x5C3487)
    static let suggestionBackground = Color(hex: 0xF3F6FD)
    static let suggestionBorder = Color(hex: 0xDBE3F7)
    static let suggestionTitle = Color(hex: 0x1F3A8A)
    static let rejectedRule = Color(hex: 0xE4B4AD)
    static let rejectedReason = Color(hex: 0x9A3428)
    static let toggleBorder = Color(hex: 0xC9D2CB)
}

/// "Employer view | Student view" switch from the card label row.
private struct AudienceToggle: View {
    @Binding var audience: LensAudience

    var body: some View {
        HStack(spacing: 0) {
            option("Employer view", .employer)
            Rectangle().fill(LensColor.toggleBorder).frame(width: 1)
            option("Student view", .student)
        }
        .fixedSize()
        .clipShape(.rect(cornerRadius: 6))
        .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(LensColor.toggleBorder) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Show results for")
    }

    private func option(_ title: String, _ value: LensAudience) -> some View {
        let isOn = audience == value
        return Button(title) { audience = value }
            .font(.text(12, weight: .bold, relativeTo: .caption))
            .foregroundStyle(isOn ? Color.white : LensColor.body)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(isOn ? VColor.blueDark : Color.white)
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// Empty, loading and "add a posting" states of card 02. A nil symbol shows a spinner.
private struct LensPlaceholder: View {
    let symbol: String?
    let title: String
    let text: String

    var body: some View {
        VStack(spacing: 6) {
            Group {
                if let symbol {
                    Image(systemName: symbol).font(.system(size: 22)).foregroundStyle(VColor.lensIcon)
                } else {
                    ProgressView().tint(VColor.lensIcon)
                }
            }
            .frame(width: 54, height: 54)
            .background(Color(hex: 0xEDF0FD), in: .circle)
            .padding(.bottom, 9)
            .accessibilityHidden(true)
            Text(title).font(.display(18, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                .multilineTextAlignment(.center)
            Text(text).font(.text(14)).foregroundStyle(LensColor.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .accessibilityElement(children: .combine)
    }
}

/// Green "x of y requirements have verified evidence" box, or the amber offline notice.
private struct LensSummary: View {
    let outcome: LensOutcome

    private var colors: (background: Color, text: Color) {
        outcome.mode == .ai ? LensColor.summaryGreen : LensColor.summaryOffline
    }

    private var headline: Text {
        let total = outcome.rows.count
        let matched = outcome.matchedCount
        return Text("\(matched) of \(total)").bold()
            + Text(" requirement\(total == 1 ? "" : "s") \(matched == 1 ? "has" : "have") verified evidence")
    }

    private var source: String {
        let count = outcome.validCredentials
        return "AI · \(outcome.model) · \(count) signed credential\(count == 1 ? "" : "s") checked\(outcome.cached ? " · saved result" : "")"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if outcome.mode == .ai {
                headline.font(.text(14))
                Text(source).font(.text(12, relativeTo: .caption)).foregroundStyle(LensColor.secondary)
            } else {
                Text("Offline keyword matching").font(.text(14, weight: .bold))
                Text("The AI lens is unavailable, so this uses simple keyword rules. Results are rougher.")
                    .font(.text(12, relativeTo: .caption)).foregroundStyle(LensColor.secondary)
            }
        }
        .foregroundStyle(colors.text)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colors.background, in: .rect(cornerRadius: 6))
        .accessibilityElement(children: .combine)
    }
}

private struct LensRowView: View {
    @Environment(VouchStore.self) private var store
    let row: LensRow
    let audience: LensAudience
    let demand: SkillDemand?
    let startProject: (String) -> Void

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
                VStack(alignment: .leading, spacing: 6) {
                    Text(row.requirement).font(.display(15, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    if let kind = row.kind, !kind.isEmpty { KindTag(text: kind) }
                    if row.matches.isEmpty {
                        Text("No verified evidence yet. This is not a judgment of ability.")
                            .font(.text(13)).foregroundStyle(LensColor.secondary)
                        if audience == .student {
                            SuggestionBox(row: row, demand: demand, startProject: startProject)
                        }
                    }
                    ForEach(row.matches, id: \.self) { match in
                        EvidenceView(match: match, credential: store.verified.first { $0.id == match.credentialID })
                    }
                }
            }
            .padding(.vertical, 17)
        }
    }
}

/// One quote backing a requirement, with a link to the signed credential.
private struct EvidenceView: View {
    let match: LensMatch
    let credential: VerifiedCredential?

    private var quoteLine: Text {
        guard let type = match.evidenceType else {
            return Text("\(match.label) · “\(match.quote)”").foregroundStyle(LensColor.secondary)
        }
        let isAction = type == "action"
        let tag = Text(isAction ? "WHAT THEY DID  " : "PRAISE  ")
            .font(.text(11, weight: .bold, relativeTo: .caption2))
            .foregroundStyle(isAction ? LensColor.actionTag : LensColor.praiseTag)
        let quote = Text("“\(match.quote)”").foregroundStyle(LensColor.body)
        let source = Text(" — \(match.witness ?? ""), via \(match.issuer ?? "")").foregroundStyle(LensColor.why)
        return tag + quote + source
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            quoteLine.font(.text(14))
            if let why = match.why, !why.isEmpty {
                Text(why).font(.text(12, relativeTo: .caption)).foregroundStyle(LensColor.why)
            }
            if let credential {
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

/// Small uppercase grey tag ("SOFT", "TECHNICAL").
private struct KindTag: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.text(11, weight: .bold, relativeTo: .caption2)).tracking(0.5)
            .foregroundStyle(LensColor.secondary)
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(VColor.gapBackground, in: .rect(cornerRadius: 3))
    }
}

/// Student view: catalog projects that could build a missing skill (suggestionMarkup in app.js).
private struct SuggestionBox: View {
    let row: LensRow
    let demand: SkillDemand?
    let startProject: (String) -> Void

    var body: some View {
        if row.kind == "credential" || row.kind == "other" {
            muted("This needs an official credential or availability; community projects can't prove it.")
        } else if row.suggestions.isEmpty {
            // Offline lines are raw sentences (headings, boilerplate), so stay quiet rather than add noise.
            if !row.keywordBased { muted("No community project in our catalog builds this yet.") }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: "leaf").font(.system(size: 13)).accessibilityHidden(true)
                    Text("Projects that could build this").font(.text(13, weight: .bold, relativeTo: .footnote))
                    if row.keywordBased {
                        Text("(keyword match)").font(.text(13, relativeTo: .footnote)).foregroundStyle(LensColor.secondary)
                    }
                }
                .foregroundStyle(LensColor.suggestionTitle)
                .padding(.bottom, 4)
                ForEach(row.suggestions, id: \.self) { suggestion in
                    suggestionView(suggestion)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LensColor.suggestionBackground, in: .rect(cornerRadius: 6))
            .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(LensColor.suggestionBorder) }
            .padding(.top, 4)
        }
    }

    private func suggestionView(_ suggestion: ProjectSuggestion) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Rectangle().fill(LensColor.suggestionBorder).frame(height: 1).padding(.bottom, 6)
            Text(suggestion.title).font(.text(14, weight: .bold)).foregroundStyle(VColor.ink)
            Text("\(suggestion.organization) · \(suggestion.time.uppercased())")
                .font(.text(12, relativeTo: .caption)).foregroundStyle(LensColor.secondary)
            if !suggestion.why.isEmpty {
                Text(suggestion.why).font(.text(13)).foregroundStyle(LensColor.body)
            }
            if let line = EmployerLens.demandLine(for: suggestion.skills, demand: demand) {
                Text(line).font(.text(12, weight: .bold, relativeTo: .caption)).foregroundStyle(LensColor.summaryGreen.text)
            }
            Button { startProject(suggestion.title) } label: {
                Label("Start this project", systemImage: "arrow.right").labelStyle(TrailingIconLabel())
            }
            .buttonStyle(.vSubtle)
            .padding(.top, 4)
        }
        .padding(.top, 6)
    }

    private func muted(_ text: String) -> some View {
        Text(text)
            .font(.text(13)).foregroundStyle(LensColor.body)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VColor.paper, in: .rect(cornerRadius: 6))
            .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(VColor.line) }
            .padding(.top, 4)
    }
}

/// "Show what the AI proposed that we rejected (n)", or the clean grounding note.
private struct RejectedList: View {
    let rejected: [LensRejection]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(VColor.line).frame(height: 1).padding(.bottom, 14)
            if rejected.isEmpty {
                Text("Grounding check: every AI-proposed quote matched its signed credential word-for-word.")
                    .font(.text(13)).foregroundStyle(LensColor.summaryGreen.text)
            } else {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(rejected, id: \.self) { item in
                            RejectedItem(item: item)
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    Text("Show what the AI proposed that we rejected (\(rejected.count))")
                        .font(.text(13, weight: .bold, relativeTo: .footnote)).foregroundStyle(VColor.blueDark)
                }
                .tint(VColor.blueDark)
            }
        }
    }
}

private struct RejectedItem: View {
    let item: LensRejection

    var body: some View {
        HStack(spacing: 10) {
            Rectangle().fill(LensColor.rejectedRule).frame(width: 3)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.requirement).font(.text(13, weight: .bold)).foregroundStyle(VColor.ink)
                Text("Proposed: “\(item.quote.isEmpty ? "(no quote)" : item.quote)” from credential \(item.credentialID.isEmpty ? "?" : item.credentialID)")
                    .font(.text(14)).foregroundStyle(LensColor.body)
                Label(item.reason, systemImage: "xmark")
                    .font(.text(14)).foregroundStyle(LensColor.rejectedReason)
            }
            .padding(.vertical, 4)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

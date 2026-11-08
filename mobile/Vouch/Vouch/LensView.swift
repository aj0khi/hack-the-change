// LensView.swift — mirrors the web "Employer lens" (index.html #lens, app.js, lens/lens.css).
// 01 takes a full job posting (typed, a live Calgary posting, or the example).
// 02 shows the evidence map from the website's AI lens, or the offline keyword lens as a fallback.
//    Student view instead shows the skill pathway (lens/student-pathway.mjs): evidence you have,
//    skills to explore, and fictional practice projects.
// 03 looks up a public Badgr badge through the website's server.

import Foundation
import SwiftUI
import UIKit

nonisolated enum LensAudience: Sendable { case employer, student }

struct LensView: View {
    @Environment(VouchStore.self) private var store
    @Binding var selection: AppTab
    @Binding var vouchTask: String
    @Binding var focusedProject: String?

    @State private var posting = ""
    @State private var outcome: LensOutcome?
    @State private var isLoading = false
    @State private var emptyMessage: (title: String, text: String)?
    @State private var audience: LensAudience = .employer
    @State private var jobs: [JobPosting] = []
    @State private var selectedJobID = ""
    @State private var analyzedPosting = ""     // posting text the current result belongs to
    @State private var requestID = 0            // newer requests win, like lensRequest in app.js

    private var selectedJob: JobPosting? { jobs.first { $0.id == selectedJobID } }

    var body: some View {
        VPage {
            PageHeading(overline: "The employer lens", title: "See the proof behind the potential",
                        subtitle: "Compare a job with signed demo evidence and explore ways to practise skills you haven't documented yet.",
                        badge: ("Job & skills lens", "text.viewfinder"))

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
                .font(.serif(27, relativeTo: .title2)).foregroundStyle(VColor.ink).padding(.top, 22)
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
                .onChange(of: posting) { postingEdited() }

            HStack(spacing: 8) {
                Button { Task { await analyze() } } label: {
                    Label("Find evidence", systemImage: "arrow.right").labelStyle(TrailingIconLabel())
                }
                .buttonStyle(.vPrimary)
                .disabled(isLoading)
                Button("Use example") {
                    selectedJobID = ""
                    startAnalysis(of: DemoData.exampleJob)
                }
                .buttonStyle(.vSubtle)
                .disabled(isLoading)
            }
            .padding(.top, 14)

            Label(disclaimer, systemImage: "info.circle")
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
                startAnalysis(of: job.postingText)
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
            } else if let outcome, audience == .student {
                PathwayView(skills: StudentPathway.build(posting: outcome.input, credentials: store.verified)) { id in
                    focusedProject = id
                    selection = .projects
                }
            } else if let outcome {
                VStack(alignment: .leading, spacing: 0) {
                    LensSummary(outcome: outcome).padding(.top, 20).padding(.bottom, 4)
                    ForEach(outcome.rows) { row in LensRowView(row: row) }
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

    private var disclaimer: String {
        if audience == .student { return EmployerLens.disclaimerStudent }
        return outcome?.mode == .offline ? EmployerLens.disclaimerOffline : EmployerLens.disclaimerAI
    }

    /// Fills the box (example or live job) and analyses it right away.
    private func startAnalysis(of text: String) {
        analyzedPosting = text.trimmingCharacters(in: .whitespacesAndNewlines)
        posting = text
        Task { await analyze() }
    }

    /// Typing in the box clears the old result, like the "input" listener in app.js.
    private func postingEdited() {
        guard posting.trimmingCharacters(in: .whitespacesAndNewlines) != analyzedPosting else { return }
        requestID += 1
        isLoading = false
        guard outcome != nil || emptyMessage != nil else { return }
        outcome = nil
        emptyMessage = ("Posting changed.", "Select Find evidence to update your results.")
    }

    /// Port of analyzeJob() in app.js: try the AI lens, fall back to keyword rules.
    private func analyze() async {
        requestID += 1
        let request = requestID
        let input = posting.trimmingCharacters(in: .whitespacesAndNewlines)
        analyzedPosting = input
        outcome = nil
        guard !input.isEmpty else {
            isLoading = false
            emptyMessage = ("Add a job posting first.", "Paste the whole posting, or pick an example.")
            return
        }
        isLoading = true
        let credentials = store.verified
        var aiOutcome: LensOutcome?
        if let submission = store.lensSubmission() {
            aiOutcome = try? await LensAPI.analyze(posting: input, submission: submission, credentials: credentials)
        }
        guard request == requestID else { return }   // the posting changed while we waited
        let result = aiOutcome ?? EmployerLens.offline(posting: input, credentials: credentials)
        outcome = result
        emptyMessage = nil
        isLoading = false
        let message = result.mode == .ai
            ? "\(result.matchedCount) of \(result.rows.count) requirements have verified evidence."
            : "Evidence map updated for \(result.rows.count) requirements."
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private func loadJobs() async {
        guard jobs.isEmpty, let response = await LensAPI.jobs() else { return }
        jobs = response.jobs ?? []
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
            .background(VColor.tint, in: .circle)
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
                            .font(.text(13)).foregroundStyle(VColor.resultText)
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
            return Text("\(match.label) · “\(match.quote)”").foregroundStyle(VColor.resultText)
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

// MARK: - Student view: skill pathway (renderStudentPathway in app.js, .pathway-* in lens/lens.css)

private struct PathwayView: View {
    let skills: [PathwaySkill]
    let viewProject: (String) -> Void

    private var supported: [PathwaySkill] { skills.filter { !$0.evidence.isEmpty } }
    private var gaps: [PathwaySkill] { skills.filter { $0.evidence.isEmpty } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Your skill pathway").font(.text(16, weight: .bold))
                Text("We found \(skills.count) skill \(skills.count == 1 ? "hint" : "hints") in this text: \(supported.count) with related demo evidence and \(gaps.count) to explore. Keywords can miss context or requirements.")
                    .font(.text(14)).foregroundStyle(PathwayColor.secondary)
            }
            .foregroundStyle(PathwayColor.introText)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PathwayColor.introBackground, in: .rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(PathwayColor.introBorder) }
            .padding(.top, 20)
            .accessibilityElement(children: .combine)

            if skills.isEmpty {
                note("No recognizable skill keywords found. Try the full job posting or review its requirements yourself.")
                    .padding(.top, 16)
            } else {
                section("Evidence you have", count: supported.count)
                if supported.isEmpty {
                    note("No related signed demo evidence found for these skills yet.")
                }
                ForEach(supported) { EvidenceSkillCard(skill: $0) }

                section("Skills to explore", count: gaps.count)
                if gaps.isEmpty {
                    note("No evidence gaps among the skills we recognized. Review the full posting for anything missed.")
                }
                ForEach(gaps) { GapSkillCard(skill: $0, viewProject: viewProject) }
            }

            Rectangle().fill(VColor.line).frame(height: 1).padding(.top, 22)
            note("Projects are fictional practice ideas, not live opportunities. Only create a demo vouch for work you want to simulate; completing a project here does not create evidence or guarantee a job.")
                .padding(.top, 14)
        }
        .onAppear {
            UIAccessibility.post(notification: .announcement,
                                 argument: "Student pathway updated: \(supported.count) skills with related evidence and \(gaps.count) to explore.")
        }
    }

    private func section(_ title: String, count: Int) -> some View {
        HStack {
            Text(title).font(.display(16, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
            Spacer()
            Text("\(count)")
                .font(.text(13, weight: .bold, relativeTo: .footnote))
                .foregroundStyle(PathwayColor.countText)
                .padding(.horizontal, 9).padding(.vertical, 3)
                .background(PathwayColor.countBackground, in: .capsule)
        }
        .padding(.top, 22)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.text(14)).foregroundStyle(PathwayColor.secondary)
    }
}

private enum PathwayColor {
    static let introBackground = Color(hex: 0xF5F1FA)
    static let introBorder = Color(hex: 0xDED5EB)
    static let introText = Color(hex: 0x393047)
    static let secondary = Color(hex: 0x655B70)
    static let countBackground = Color(hex: 0xEEE8F5)
    static let countText = Color(hex: 0x51425E)
    static let projectsBackground = Color(hex: 0xF8F5FB)
    static let projectRule = Color(hex: 0xE6DEED)
}

/// White card used for both pathway lists.
private struct PathwayCard<Content: View>: View {
    let name: String
    let context: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(name).font(.text(15, weight: .bold)).foregroundStyle(VColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Posting mentions: “\(context)”")
                .font(.text(14)).foregroundStyle(PathwayColor.secondary).padding(.top, 6)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(VColor.line) }
        .padding(.top, 10)
    }
}

private struct EvidenceSkillCard: View {
    @Environment(VouchStore.self) private var store
    let skill: PathwaySkill

    var body: some View {
        PathwayCard(name: skill.name, context: skill.context) {
            ForEach(skill.evidence, id: \.self) { item in
                Text("Demo evidence · \(item.skill): “\(item.quote)”")
                    .font(.text(14)).foregroundStyle(VColor.resultText).padding(.top, 10)
                if let credential = store.verified.first(where: { $0.id == item.credentialID }) {
                    NavigationLink(value: credential) {
                        Label("View signed evidence", systemImage: "arrow.up.right")
                            .labelStyle(TrailingIconLabel())
                            .font(.text(13, weight: .bold, relativeTo: .footnote))
                            .foregroundStyle(VColor.blue)
                            .frame(minHeight: 44)
                    }
                }
            }
        }
    }
}

private struct GapSkillCard: View {
    let skill: PathwaySkill
    let viewProject: (String) -> Void
    @State private var showMore = false

    var body: some View {
        PathwayCard(name: skill.name, context: skill.context) {
            Text("No matching demo evidence yet. This does not mean you lack this skill.")
                .font(.text(14)).foregroundStyle(VColor.resultText).padding(.top, 10)
            if skill.projects.isEmpty {
                Text("No related demo project yet. Consider another way to practise or document this skill.")
                    .font(.text(14)).foregroundStyle(VColor.resultText).padding(.top, 8)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Fictional practice ideas").font(.text(14, weight: .bold)).foregroundStyle(PathwayColor.countText)
                    ForEach(skill.projects.prefix(2)) { project(of: $0) }
                    if skill.projects.count > 2 {
                        let extra = skill.projects.count - 2
                        DisclosureGroup(isExpanded: $showMore) {
                            ForEach(skill.projects.dropFirst(2)) { project(of: $0) }
                        } label: {
                            Text("Show \(extra) more \(extra == 1 ? "idea" : "ideas")")
                                .font(.text(14, weight: .bold)).foregroundStyle(PathwayColor.countText)
                        }
                        .tint(PathwayColor.countText)
                        .padding(.top, 10)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PathwayColor.projectsBackground, in: .rect(cornerRadius: 9))
                .padding(.top, 12)
            }
        }
    }

    private func project(of project: CommunityProject) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(project.title).font(.text(14, weight: .bold)).foregroundStyle(PathwayColor.countText)
            Text("\(project.organization) · \(project.time)").font(.text(13)).foregroundStyle(PathwayColor.secondary)
            Text(project.description).font(.text(14)).foregroundStyle(PathwayColor.secondary).padding(.top, 2)
            Button { viewProject(project.id) } label: {
                Label("View project", systemImage: "arrow.up.right").labelStyle(TrailingIconLabel())
            }
            .buttonStyle(.vLink)
            .accessibilityLabel("View project: \(project.title)")
        }
        .padding(.top, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(PathwayColor.projectRule).frame(height: 1) }
        .padding(.top, 10)
    }
}

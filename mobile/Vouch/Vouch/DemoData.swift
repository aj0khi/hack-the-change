// DemoData.swift
// Same fictional projects, example credential, example job and skill keywords as the web app (app.js).

import Foundation
import SwiftUI

nonisolated struct CommunityProject: Identifiable, Hashable, Sendable {
    let id: String          // same ids as lens/projects.mjs, so AI suggestions map back to a project
    let title: String
    let organization: String
    let description: String
    let skills: [String]
    let systemImage: String
    let time: String
    let palette: Palette

    nonisolated enum Palette: Sendable { case peach, lilac, mint }
}

nonisolated enum DemoData {
    static let issuerName = "Community Centre (fictional demo)"
    static let studentName = "Priya Sharma"

    /// Canada's nine Skills for Success, spelled exactly as the web form does.
    static let skills = [
        "Communication", "Digital", "Problem solving", "Collaboration", "Adaptability",
        "Writing", "Reading", "Numeracy", "Creativity and innovation",
    ]

    /// Copy of the web catalog in lens/projects.mjs (fictional). The Employer lens may only suggest these ids.
    static let projects: [CommunityProject] = [
        CommunityProject(
            id: "video-calls",
            title: "Help neighbours connect online",
            organization: "Neighbourhood centre · example",
            description: "Help someone feel confident connecting with family over a video call.",
            skills: ["Communication", "Digital"], systemImage: "video", time: "1–2 hours", palette: .peach),
        CommunityProject(
            id: "signup-sheet",
            title: "Make a community spreadsheet easier",
            organization: "Community organization · example",
            description: "Organize a sign-up sheet so a small team can spend more time helping.",
            skills: ["Digital", "Problem solving"], systemImage: "tablecells", time: "2–3 hours", palette: .lilac),
        CommunityProject(
            id: "digital-guide",
            title: "Create a simple digital guide",
            organization: "Neighbourhood centre · example",
            description: "Write clear, friendly instructions for someone learning a new tool.",
            skills: ["Writing", "Communication"], systemImage: "doc.richtext", time: "1–2 hours", palette: .mint),
        CommunityProject(
            id: "volunteer-database",
            title: "Clean up a volunteer database",
            organization: "Food bank · example",
            description: "Merge duplicate contacts, fix columns and set up simple filters and lookups in a shared volunteer list.",
            skills: ["Digital", "Numeracy", "Problem solving"], systemImage: "cylinder.split.1x2", time: "3–4 hours", palette: .lilac),
        CommunityProject(
            id: "tech-help-hour",
            title: "Run a drop-in tech help hour",
            organization: "Seniors' centre · example",
            description: "Answer walk-in questions about phones, tablets and email, troubleshoot problems and follow up when something isn't fixed.",
            skills: ["Communication", "Problem solving", "Digital"], systemImage: "laptopcomputer", time: "2 hours / week", palette: .peach),
        CommunityProject(
            id: "event-check-in",
            title: "Coordinate check-in for a community event",
            organization: "Community association · example",
            description: "Plan the sign-in table, schedule volunteers, greet attendees and keep the headcount accurate on the day.",
            skills: ["Collaboration", "Adaptability", "Numeracy"], systemImage: "calendar.badge.checkmark", time: "Half day", palette: .mint),
        CommunityProject(
            id: "newsletter",
            title: "Write the monthly newsletter",
            organization: "Non-profit · example",
            description: "Interview staff, draft short plain-language articles and edit them for a newsletter that goes to members.",
            skills: ["Writing", "Reading", "Creativity and innovation"], systemImage: "newspaper", time: "3 hours", palette: .lilac),
        CommunityProject(
            id: "newcomer-setup",
            title: "Set up devices for newcomer families",
            organization: "Settlement agency · example",
            description: "Help newcomer families set up phones, email and bus-pass apps, adapting explanations across languages and comfort levels.",
            skills: ["Adaptability", "Communication", "Digital"], systemImage: "iphone", time: "2–3 hours", palette: .peach),
    ]

    static func project(id: String) -> CommunityProject? { projects.first { $0.id == id } }

    /// Signed on first launch, like the web app's fictional example.
    static let examplePayload = VouchPayload(
        title: "Help neighbours connect online",
        witness: "Doug",
        transcript: "Priya was patient and explained every step clearly. She showed me how to call my family and wrote the steps down for me.",
        issuer: issuerName,
        student: studentName,
        example: true,
        issuedAt: "2026-11-07",
        mappings: [
            SkillMapping(skill: "Communication", quote: "Priya was patient and explained every step clearly."),
            SkillMapping(skill: "Digital", quote: "She showed me how to call my family and wrote the steps down for me."),
        ])

    /// Same fictional posting as jobExample in app.js.
    static let exampleJob = """
    Client Support Coordinator (Junior) — Bow River Community Services (fictional example), Calgary, AB

    We're looking for a warm, organized person to join our front-desk technology team. You'll be the first point of contact for older adults and newcomers who need help with our online booking system, video appointments and shared devices.

    What you'll do:
    You will walk clients through using tablets, phones and video-call apps, explaining technical steps in plain language and staying patient when things don't work the first time. You'll create simple how-to guides and checklists for clients and staff, and keep our volunteer and appointment spreadsheets accurate and up to date.

    What we're looking for:
    Excellent communication skills with people of all ages and comfort levels with technology. Experience writing clear instructions or documentation. Comfort with spreadsheets (Excel or Google Sheets). Basic SQL or database experience is an asset. A valid Class 5 Alberta driver's licence and a clean police information check are required. CompTIA A+ certification is considered an asset. Availability for some evening and weekend shifts.

    We offer a supportive team, paid training and a transit pass.
    """

    /// Keyword rules copied from lens/skills.mjs (offline Employer lens and keyword suggestions).
    static let skillTerms: [String: String] = [
        "Communication": #"\b(communicat\w*|explain\w*|present\w*|interpersonal|customer service)\b"#,
        "Digital": #"\b(digital|technology|technical|computer\w*|software|spreadsheet\w*|excel)\b"#,
        "Problem solving": #"\b(problem[ -]solv\w*|troubleshoot\w*|solve problems)\b"#,
        "Collaboration": #"\b(collaborat\w*|teamwork|team player|work(ing)? with (a |the )?team)\b"#,
        "Adaptability": #"\b(adaptab\w*|adapt\w*|flexib\w*|fast[- ]paced)\b"#,
        "Writing": #"\b(writ\w*|documentation|document\w*)\b"#,
        "Reading": #"\b(reading|interpret\w*|comprehension)\b"#,
        "Numeracy": #"\b(numeracy|numerical|calculat\w*|math\w*|accounting|budget\w*)\b"#,
        "Creativity and innovation": #"\b(creativ\w*|innovat\w*)\b"#,
    ]

    static func requirement(_ line: String, mentions skill: String) -> Bool {
        guard let pattern = skillTerms[skill],
              let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        else { return false }
        return regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
    }

    /// Splits a transcript into sentences, so each skill can be backed by one exact sentence.
    static func sentences(in text: String) -> [String] {
        var result: [String] = []
        text.enumerateSubstrings(in: text.startIndex..., options: .bySentences) { sub, _, _, _ in
            let trimmed = (sub ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { result.append(trimmed) }
        }
        return result.isEmpty && !text.isEmpty ? [text.trimmingCharacters(in: .whitespacesAndNewlines)] : result
    }
}

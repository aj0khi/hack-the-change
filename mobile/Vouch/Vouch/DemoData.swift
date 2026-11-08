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
    var topics: [String] = []   // e.g. ["sql"] for keywordProjectSuggestions

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

    /// Copy of the web catalog in lens/projects.mjs (fictional, generated from it on 2026-11-07).
    /// The Employer lens may only suggest these ids.
    static let projects: [CommunityProject] = [
        CommunityProject(
            id: "video-calls",
            title: "Help neighbours connect online",
            organization: "Neighbourhood centre · example",
            description: "Help someone feel confident connecting with family over a video call.",
            skills: ["Communication", "Digital"], systemImage: "video", time: "1–2 HOURS", palette: .peach),
        CommunityProject(
            id: "signup-sheet",
            title: "Make a community spreadsheet easier",
            organization: "Community organization · example",
            description: "Organize a fictional sign-up sheet in Excel or Google Sheets so a small team can spend more time helping.",
            skills: ["Digital", "Problem solving"], systemImage: "tablecells", time: "2–3 HOURS", palette: .lilac),
        CommunityProject(
            id: "digital-guide",
            title: "Create a simple digital guide",
            organization: "Neighbourhood centre · example",
            description: "Write clear, friendly instructions for someone learning a new tool.",
            skills: ["Writing", "Communication"], systemImage: "doc.richtext", time: "1–2 HOURS", palette: .mint),
        CommunityProject(
            id: "volunteer-database",
            title: "Clean up a volunteer database",
            organization: "Food bank · example",
            description: "Merge duplicate contacts, fix columns and set up simple filters and lookups in a fictional volunteer database.",
            skills: ["Digital", "Numeracy", "Problem solving"], systemImage: "cylinder.split.1x2", time: "3–4 HOURS", palette: .lilac),
        CommunityProject(
            id: "tech-help-hour",
            title: "Run a drop-in tech help hour",
            organization: "Seniors' centre · example",
            description: "Answer walk-in questions about phones, tablets and email, troubleshoot problems and follow up when something isn't fixed.",
            skills: ["Communication", "Problem solving", "Digital"], systemImage: "laptopcomputer", time: "2 HOURS / WEEK", palette: .peach),
        CommunityProject(
            id: "event-check-in",
            title: "Coordinate check-in for a community event",
            organization: "Community association · example",
            description: "Plan the sign-in table, schedule volunteers, greet attendees and keep the headcount accurate on the day.",
            skills: ["Collaboration", "Adaptability", "Numeracy"], systemImage: "calendar.badge.checkmark", time: "HALF DAY", palette: .mint),
        CommunityProject(
            id: "newsletter",
            title: "Write the monthly newsletter",
            organization: "Non-profit · example",
            description: "Interview staff, draft short plain-language articles and edit them for a newsletter that goes to members.",
            skills: ["Writing", "Reading", "Creativity and innovation"], systemImage: "newspaper", time: "3 HOURS", palette: .lilac),
        CommunityProject(
            id: "newcomer-setup",
            title: "Set up devices for newcomer families",
            organization: "Settlement agency · example",
            description: "Help newcomer families set up phones, email and bus-pass apps, adapting explanations across languages and comfort levels.",
            skills: ["Adaptability", "Communication", "Digital"], systemImage: "iphone", time: "2–3 HOURS", palette: .peach),
        CommunityProject(
            id: "community-sql-report",
            title: "Explore a fictional community database with SQL",
            organization: "Community centre · example",
            description: "Use a fictional event database to practise SQL SELECT, filtering and counting, then summarize what the sample data shows.",
            skills: ["Digital", "Numeracy", "Problem solving"], systemImage: "cylinder.split.1x2", time: "3–4 HOURS", palette: .lilac,
            topics: ["sql"]),
        CommunityProject(
            id: "food-pantry-budget",
            title: "Build a food pantry budget spreadsheet",
            organization: "Food pantry · example",
            description: "Use Excel or Google Sheets and a fictional grocery budget to practise formulas, totals and a simple chart for a volunteer team.",
            skills: ["Numeracy", "Digital", "Collaboration"], systemImage: "tablecells", time: "2–3 HOURS", palette: .mint),
        CommunityProject(
            id: "welcome-desk",
            title: "Plan a friendly community welcome desk",
            organization: "Community association · example",
            description: "Practise greeting visitors, answering common questions and working with volunteers to direct people to the right resources.",
            skills: ["Communication", "Collaboration", "Adaptability"], systemImage: "person.2", time: "2 HOURS", palette: .peach),
        CommunityProject(
            id: "accessible-event-guide",
            title: "Create an accessible event guide",
            organization: "Neighbourhood centre · example",
            description: "Read a fictional event brief and write a plain-language guide with a clear schedule, directions and accessibility information.",
            skills: ["Reading", "Writing", "Creativity and innovation"], systemImage: "doc.richtext", time: "2–3 HOURS", palette: .lilac),
        CommunityProject(
            id: "sql-food-pantry",
            title: "Query a sample food pantry inventory",
            organization: "Food pantry · example",
            description: "Practise SQL filters, joins and totals with fictional food pantry inventory and delivery records.",
            skills: ["Digital", "Numeracy", "Problem solving"], systemImage: "cylinder.split.1x2", time: "3–4 HOURS", palette: .lilac,
            topics: ["sql"]),
        CommunityProject(
            id: "python-donations",
            title: "Summarize sample donations with Python",
            organization: "Community pantry · example",
            description: "Write a small Python script to read fictional donation records, calculate totals and check for missing entries.",
            skills: ["Digital", "Numeracy", "Problem solving"], systemImage: "chevron.left.forwardslash.chevron.right", time: "3–4 HOURS", palette: .lilac),
        CommunityProject(
            id: "python-event-counts",
            title: "Explore fictional event attendance with Python",
            organization: "Community centre · example",
            description: "Practise Python by grouping sample event attendance data and reporting the busiest activities.",
            skills: ["Digital", "Numeracy", "Reading"], systemImage: "chart.bar", time: "3 HOURS", palette: .mint),
        CommunityProject(
            id: "javascript-event-page",
            title: "Build a sample community event page",
            organization: "Neighbourhood centre · example",
            description: "Use HTML and JavaScript to build a fictional event page with an interactive schedule and clear accessibility labels.",
            skills: ["Digital", "Creativity and innovation", "Writing"], systemImage: "chevron.left.forwardslash.chevron.right", time: "4–5 HOURS", palette: .peach),
        CommunityProject(
            id: "javascript-resource-finder",
            title: "Make a sample resource finder",
            organization: "Community association · example",
            description: "Practise JavaScript by filtering a fictional list of community resources and showing a useful empty state.",
            skills: ["Digital", "Problem solving", "Creativity and innovation"], systemImage: "magnifyingglass", time: "4 HOURS", palette: .lilac),
        CommunityProject(
            id: "spreadsheet-rota",
            title: "Plan a volunteer rota in a spreadsheet",
            organization: "Community kitchen · example",
            description: "Use Excel or Google Sheets to organize a fictional volunteer rota and count available shifts.",
            skills: ["Digital", "Collaboration", "Numeracy"], systemImage: "tablecells", time: "2–3 HOURS", palette: .mint),
        CommunityProject(
            id: "database-resource-list",
            title: "Organize a sample resource database",
            organization: "Community centre · example",
            description: "Design categories and clean fictional resource records in a sample database so volunteers can find information.",
            skills: ["Digital", "Reading", "Problem solving"], systemImage: "cylinder.split.1x2", time: "3 HOURS", palette: .peach),
        CommunityProject(
            id: "service-faq",
            title: "Practise customer service with a help-desk FAQ",
            organization: "Neighbourhood centre · example",
            description: "Role-play customer service questions with a partner and write a friendly FAQ for fictional visitors.",
            skills: ["Communication", "Writing", "Collaboration"], systemImage: "message", time: "2 HOURS", palette: .lilac),
        CommunityProject(
            id: "event-backup-plan",
            title: "Plan for changes at a community event",
            organization: "Community association · example",
            description: "Work with a volunteer team to adapt a fictional event plan when the venue, schedule or available staff changes.",
            skills: ["Adaptability", "Collaboration", "Problem solving"], systemImage: "calendar.badge.checkmark", time: "2 HOURS", palette: .mint),
        CommunityProject(
            id: "community-poster",
            title: "Design a welcoming community poster",
            organization: "Neighbourhood centre · example",
            description: "Read a fictional event brief and design a clear, creative poster for different audiences.",
            skills: ["Creativity and innovation", "Reading", "Communication"], systemImage: "paintpalette", time: "2–3 HOURS", palette: .peach),
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
